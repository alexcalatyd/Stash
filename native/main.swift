import AppKit
import Carbon
import CryptoKit
import ServiceManagement
import WebKit

// Stash — historial del portapapeles que vive en la barra de menús.
// Swift vigila el portapapeles, guarda el historial en disco y abre un panel de
// cristal nativo; la interfaz (React) va dentro de un WKWebView transparente.

// MARK: - Rutas

enum Paths {
    static let root: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let url = base.appendingPathComponent("Stash", isDirectory: true)
        try? FileManager.default.createDirectory(at: url.appendingPathComponent("blobs"), withIntermediateDirectories: true)
        return url
    }()
    static let history = root.appendingPathComponent("history.json")
    static func blob(_ name: String) -> URL { root.appendingPathComponent("blobs").appendingPathComponent(name) }
}

// MARK: - Modelo

struct Item: Codable {
    var id: String
    var kind: String            // text · link · color · image · file
    var text: String?
    var files: [String]?
    var width: Int?
    var height: Int?
    var bytes: Int?
    var rich: Bool?             // hay una copia RTF en blobs/<id>.rtf
    var app: String?
    var bundle: String?
    var date: Double            // milisegundos desde 1970
    var pinned: Bool
    var hash: String
}

func sha(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

func classify(_ text: String) -> String {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.count < 2048, !t.contains(where: { $0.isWhitespace }),
       let url = URL(string: t), let scheme = url.scheme?.lowercased(),
       ["http", "https", "mailto", "ftp"].contains(scheme) { return "link" }
    let color = #"^(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(rgb|rgba|hsl|hsla|oklch|oklab)\([^)]{3,60}\))$"#
    if t.range(of: color, options: .regularExpression) != nil { return "color" }
    return "text"
}

// MARK: - Historial

final class Store {
    private(set) var items: [Item] = []
    var limit: Int {
        didSet { UserDefaults.standard.set(limit, forKey: "limit"); trim(); changed() }
    }
    var onChange: (() -> Void)?
    private var saveWork: DispatchWorkItem?

    init() {
        let saved = UserDefaults.standard.integer(forKey: "limit")
        limit = saved > 0 ? saved : 500
        if let data = try? Data(contentsOf: Paths.history),
           let decoded = try? JSONDecoder().decode([Item].self, from: data) { items = decoded }
    }

    func add(_ item: Item) {
        var item = item
        if let index = items.firstIndex(where: { $0.hash == item.hash }) {
            // Ya estaba: sube arriba con los datos nuevos y conserva si estaba fijado.
            let old = items.remove(at: index)
            deleteBlobs(old)
            item.pinned = old.pinned
        }
        items.insert(item, at: 0)
        trim()
        changed()
    }

    func touch(_ id: String) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        var item = items.remove(at: index)
        item.date = Date().timeIntervalSince1970 * 1000
        items.insert(item, at: 0)
        changed()
    }

    func togglePin(_ id: String) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].pinned.toggle()
        changed()
    }

    func remove(_ id: String) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        deleteBlobs(items.remove(at: index))
        changed()
    }

    func clear(keepPinned: Bool) {
        let gone = items.filter { !keepPinned || !$0.pinned }
        items = keepPinned ? items.filter(\.pinned) : []
        gone.forEach(deleteBlobs)
        changed()
    }

    func item(_ id: String) -> Item? { items.first { $0.id == id } }

    private func trim() {
        var unpinned = 0
        var kept: [Item] = []
        for item in items {
            if item.pinned { kept.append(item); continue }
            unpinned += 1
            if unpinned <= limit { kept.append(item) } else { deleteBlobs(item) }
        }
        items = kept
    }

    private func deleteBlobs(_ item: Item) {
        for name in ["\(item.id).png", "\(item.id)-thumb.png", "\(item.id).rtf"] {
            try? FileManager.default.removeItem(at: Paths.blob(name))
        }
    }

    private func changed() {
        onChange?()
        saveWork?.cancel()
        let snapshot = items
        let work = DispatchWorkItem {
            if let data = try? JSONEncoder().encode(snapshot) { try? data.write(to: Paths.history, options: .atomic) }
        }
        saveWork = work
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 0.4, execute: work)
    }

    func flush() {
        saveWork?.cancel()
        if let data = try? JSONEncoder().encode(items) { try? data.write(to: Paths.history, options: .atomic) }
    }
}

// MARK: - Vigilante del portapapeles

final class Watcher {
    private let pasteboard = NSPasteboard.general
    private var lastChange: Int
    private var timer: Timer?
    var ownChange = -1
    var paused = false
    let onItem: (Item) -> Void

    /// Tipos que marcan contenido que no se debe guardar (contraseñas, datos temporales).
    private static let ignored: Set<String> = [
        "org.nspasteboard.ConcealedType", "org.nspasteboard.TransientType",
        "org.nspasteboard.AutoGeneratedType", "com.agilebits.onepassword",
        "de.petermaurer.TransientPasteboardType", "com.typeit4me.clipping",
        "Pasteboard generator type", "net.antelle.keeweb",
    ]

    init(onItem: @escaping (Item) -> Void) {
        self.onItem = onItem
        lastChange = pasteboard.changeCount
    }

    func start() {
        let timer = Timer(timeInterval: 0.35, repeats: true) { [weak self] _ in self?.poll() }
        timer.tolerance = 0.1
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func poll() {
        let change = pasteboard.changeCount
        guard change != lastChange else { return }
        lastChange = change
        guard !paused, change != ownChange else { return }

        let types = (pasteboard.types ?? []).map(\.rawValue)
        if types.contains(where: Self.ignored.contains) { return }

        let front = NSWorkspace.shared.frontmostApplication
        let now = Date().timeIntervalSince1970 * 1000
        let id = UUID().uuidString
        var item = Item(id: id, kind: "text", app: front?.localizedName, bundle: front?.bundleIdentifier,
                        date: now, pinned: false, hash: "")

        // 1 · Archivos copiados en Finder
        if let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL],
           !urls.isEmpty {
            item.kind = "file"
            item.files = urls.map(\.path)
            item.text = urls.map(\.lastPathComponent).joined(separator: "\n")
            item.hash = "f:" + sha(Data(item.files!.joined(separator: "\n").utf8))
            onItem(item)
            return
        }

        // 2 · Texto (con su versión RTF si la hay)
        if let text = pasteboard.string(forType: .string),
           !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 1_000_000 {
            item.text = text
            item.kind = classify(text)
            item.hash = "t:" + sha(Data(text.utf8))
            if let rtf = pasteboard.data(forType: .rtf), rtf.count < 4_000_000,
               (try? rtf.write(to: Paths.blob("\(id).rtf"))) != nil { item.rich = true }
            onItem(item)
            return
        }

        // 3 · Imagen (captura, imagen copiada de una web…)
        let raw = pasteboard.data(forType: .png) ?? pasteboard.data(forType: .tiff)
        guard let raw, raw.count < 60_000_000 else { return }
        let isPNG = pasteboard.data(forType: .png) != nil
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let rep = NSBitmapImageRep(data: raw),
                  let png = isPNG ? raw : rep.representation(using: .png, properties: [:]) else { return }
            item.kind = "image"
            item.width = rep.pixelsWide
            item.height = rep.pixelsHigh
            item.bytes = png.count
            item.hash = "i:" + sha(png)
            guard (try? png.write(to: Paths.blob("\(id).png"))) != nil else { return }
            Self.writeThumbnail(png, to: Paths.blob("\(id)-thumb.png"))
            DispatchQueue.main.async { self?.onItem(item) }
        }
    }

    private static func writeThumbnail(_ data: Data, to url: URL) {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: 720,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        guard let thumb = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(destination, thumb, nil)
        CGImageDestinationFinalize(destination)
    }

    /// Devuelve un elemento al portapapeles. `plain` quita el formato del texto.
    func copy(_ item: Item, plain: Bool) {
        pasteboard.clearContents()
        switch item.kind {
        case "file":
            let urls = (item.files ?? []).map { URL(fileURLWithPath: $0) as NSURL }
            pasteboard.writeObjects(urls)
        case "image":
            guard let png = try? Data(contentsOf: Paths.blob("\(item.id).png")) else { break }
            pasteboard.declareTypes([.png, .tiff], owner: nil)
            pasteboard.setData(png, forType: .png)
            if let tiff = NSBitmapImageRep(data: png)?.tiffRepresentation { pasteboard.setData(tiff, forType: .tiff) }
        default:
            let text = item.text ?? ""
            if !plain, item.rich == true, let rtf = try? Data(contentsOf: Paths.blob("\(item.id).rtf")) {
                pasteboard.declareTypes([.rtf, .string], owner: nil)
                pasteboard.setData(rtf, forType: .rtf)
            }
            pasteboard.setString(text, forType: .string)
        }
        ownChange = pasteboard.changeCount
    }
}

// MARK: - Sirve la interfaz (app://local/…) y las imágenes del historial

final class SchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    private var icons: [String: Data] = [:]

    init(root: URL) { self.root = root.standardizedFileURL }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }

        var data: Data?
        var type = "application/octet-stream"
        if path.hasPrefix("/__blob/") {
            let name = String(path.dropFirst(8))
            if !name.contains("/"), !name.contains("..") {
                data = try? Data(contentsOf: Paths.blob(name))
                type = "image/png"
            }
        } else if path.hasPrefix("/__icon/") {
            data = icon(for: String(path.dropFirst(8)))
            type = "image/png"
        } else {
            let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
            if file.path.hasPrefix(root.path + "/") { data = try? Data(contentsOf: file) }
            let types = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8",
                         "css": "text/css; charset=utf-8", "svg": "image/svg+xml", "png": "image/png",
                         "json": "application/json", "woff2": "font/woff2"]
            type = types[file.pathExtension] ?? type
        }

        guard let data else {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "max-age=3600"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func icon(for bundle: String) -> Data? {
        if let cached = icons[bundle] { return cached }
        guard let app = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) else { return nil }
        let image = NSWorkspace.shared.icon(forFile: app.path)
        let size = NSSize(width: 64, height: 64)
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 64, pixelsHigh: 64, bitsPerSample: 8,
                                         samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                         colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        image.draw(in: NSRect(origin: .zero, size: size))
        NSGraphicsContext.restoreGraphicsState()
        let png = rep.representation(using: .png, properties: [:])
        icons[bundle] = png
        return png
    }
}

// MARK: - Panel flotante que puede recibir teclado sin activar la app

final class Panel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

// MARK: - Atajo global (⌥⌘V) con Carbon: no necesita permisos

private var hotKeyAction: (() -> Void)?

func registerHotKey(_ action: @escaping () -> Void) {
    hotKeyAction = action
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
        DispatchQueue.main.async { hotKeyAction?() }
        return noErr
    }, 1, &spec, nil, nil)
    var ref: EventHotKeyRef?
    let id = EventHotKeyID(signature: OSType(0x53_54_53_48), id: 1) // «STSH»
    RegisterEventHotKey(UInt32(kVK_ANSI_V), UInt32(cmdKey | optionKey), id, GetApplicationEventTarget(), 0, &ref)
}

// MARK: - Franja superior de la ventana de ajustes para arrastrarla

final class DragStrip: NSView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var statusItem: NSStatusItem!
    private var panel: Panel!
    private var panelView: WKWebView!
    private var settingsWindow: NSWindow?
    private var settingsView: WKWebView?
    private var ready = Set<ObjectIdentifier>()
    private let store = Store()
    private var watcher: Watcher!
    private var lastHide = Date.distantPast
    private var pushWork: DispatchWorkItem?
    private var openedByUser = false

    private static let panelSize = NSSize(width: 320, height: 460)
    private static let settingsSize = NSSize(width: 420, height: 640)

    private var english: Bool {
        get {
            if let saved = UserDefaults.standard.string(forKey: "lang") { return saved == "en" }
            return !(Locale.preferredLanguages.first ?? "en").hasPrefix("es")
        }
        set { UserDefaults.standard.set(newValue ? "en" : "es", forKey: "lang") }
    }
    private func tr(_ es: String, _ en: String) -> String { english ? en : es }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Abierta a mano (Finder, Launchpad, Spotlight) → se abre el panel de arriba.
        // Abierta al iniciar sesión → se queda callada en la barra de menús.
        let event = NSAppleEventManager.shared().currentAppleEvent
        let asLoginItem = event?.paramDescriptor(forKeyword: keyAELaunchedAsLogInItem) != nil
        openedByUser = event?.eventID == kAEOpenApplication && !asLoginItem
            && ProcessInfo.processInfo.systemUptime > 90
        buildMainMenu()
        watcher = Watcher { [weak self] item in self?.store.add(item) }
        watcher.paused = UserDefaults.standard.bool(forKey: "paused")
        store.onChange = { [weak self] in self?.scheduleHistoryPush() }
        watcher.start()

        setUpStatusItem()
        setUpPanel()
        registerHotKey { [weak self] in self?.toggle() }

        // La primera vez se apunta a abrirse al iniciar sesión: así nunca se pierde nada.
        let firstRun = !UserDefaults.standard.bool(forKey: "loginConfigured")
        if firstRun {
            UserDefaults.standard.set(true, forKey: "loginConfigured")
            try? SMAppService.mainApp.register()
        }
        if openedByUser { presentPanelFromLaunch() }
    }

    /// Al abrir la app a mano, Spotlight o Finder recuperan el foco un instante después:
    /// se activa Stash y se espera un poco para que el panel no se cierre solo.
    private func presentPanelFromLaunch() {
        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            guard let self, !self.panel.isVisible else { return }
            self.showPanel()
        }
    }

    // Doble clic en Stash.app cuando ya está abierta.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if settingsWindow?.isVisible != true { presentPanelFromLaunch() }
        return false
    }

    func applicationWillTerminate(_ notification: Notification) { store.flush() }

    // MARK: Barra de menús

    private func setUpStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        guard let button = statusItem.button else { return }
        updateStatusIcon()
        button.target = self
        button.action = #selector(statusClicked)
        button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        button.toolTip = "Stash — ⌥⌘V"
    }

    private func updateStatusIcon(symbol: String? = nil) {
        guard let button = statusItem.button else { return }
        let name = symbol ?? (watcher.paused ? "clipboard" : "list.clipboard")
        let config = NSImage.SymbolConfiguration(pointSize: 14, weight: .medium)
        let image = NSImage(systemSymbolName: name, accessibilityDescription: "Stash")?.withSymbolConfiguration(config)
        image?.isTemplate = true
        button.image = image
        button.appearsDisabled = watcher.paused && symbol == nil
    }

    private func flashCopied() {
        updateStatusIcon(symbol: "checkmark")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in self?.updateStatusIcon() }
    }

    @objc private func statusClicked() {
        let event = NSApp.currentEvent
        if event?.type == .rightMouseUp || event?.modifierFlags.contains(.control) == true {
            showStatusMenu()
        } else {
            toggle()
        }
    }

    private func showStatusMenu() {
        hidePanel()
        let menu = NSMenu()
        menu.addItem(item(tr("Abrir historial", "Open History"), #selector(openFromMenu), key: "v", modifiers: [.command, .option]))
        menu.addItem(item(tr("Ajustes…", "Settings…"), #selector(openSettings), key: ","))
        menu.addItem(.separator())
        menu.addItem(item(tr("Salir de Stash", "Quit Stash"), #selector(NSApplication.terminate(_:)), key: "q", target: NSApp))
        statusItem.menu = menu
        statusItem.button?.performClick(nil)
        statusItem.menu = nil
    }

    private func item(_ title: String, _ action: Selector, key: String = "",
                      modifiers: NSEvent.ModifierFlags = [.command], target: AnyObject? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.keyEquivalentModifierMask = modifiers
        item.target = target ?? self
        return item
    }

    @objc private func openFromMenu() { showPanel() }
    @objc private func openSettings() { showSettings() }

    private func setPaused(_ paused: Bool) {
        watcher.paused = paused
        UserDefaults.standard.set(paused, forKey: "paused")
        updateStatusIcon()
    }

    private func setLaunchAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            if on { SMAppService.openSystemSettingsLoginItems() }
        }
    }

    // MARK: Vistas web

    private func makeWebView(page: String, size: NSSize) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let ui = Bundle.main.resourceURL!.appendingPathComponent("ui")
        configuration.setURLSchemeHandler(SchemeHandler(root: ui), forURLScheme: "app")
        configuration.userContentController.add(self, name: "stash")
        let view = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: configuration)
        view.navigationDelegate = self
        view.setValue(false, forKey: "drawsBackground")
        view.underPageBackgroundColor = .clear
        view.allowsMagnification = false
        view.isInspectable = ProcessInfo.processInfo.environment["STASH_DEBUG"] != nil
        view.autoresizingMask = [.width, .height]
        view.load(URLRequest(url: URL(string: "app://local/index.html#\(page)")!))
        return view
    }

    // MARK: Panel del historial (desde la barra de menús)

    private func setUpPanel() {
        let size = Self.panelSize
        panelView = makeWebView(page: "panel", size: size)

        panel = Panel(contentRect: NSRect(origin: .zero, size: size),
                      styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView],
                      backing: .buffered, defer: false)
        panel.isFloatingPanel = true
        panel.level = .popUpMenu
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient, .ignoresCycle]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.becomesKeyOnlyIfNeeded = false
        panel.animationBehavior = .none
        panel.delegate = self

        let radius: CGFloat = 22
        panelView.wantsLayer = true
        panelView.layer?.cornerRadius = radius
        panelView.layer?.cornerCurve = .continuous
        panelView.layer?.masksToBounds = true
        if #available(macOS 26.0, *) {
            let glass = NSGlassEffectView(frame: NSRect(origin: .zero, size: size))
            glass.style = .regular
            glass.cornerRadius = radius
            glass.contentView = panelView
            panel.contentView = glass
        } else {
            let blur = NSVisualEffectView(frame: NSRect(origin: .zero, size: size))
            blur.material = .popover
            blur.blendingMode = .behindWindow
            blur.state = .active
            blur.wantsLayer = true
            blur.layer?.cornerRadius = radius
            blur.layer?.cornerCurve = .continuous
            blur.layer?.masksToBounds = true
            panelView.frame = blur.bounds
            blur.addSubview(panelView)
            panel.contentView = blur
        }
    }

    private func toggle() {
        if panel.isVisible { hidePanel(); return }
        // El clic en el icono quita el foco al panel antes de llegar aquí: no se reabre.
        if Date().timeIntervalSince(lastHide) < 0.3 { return }
        showPanel()
    }

    /// Siempre debajo del icono de la barra de menús.
    private func showPanel() {
        let size = Self.panelSize
        var origin: NSPoint
        if let button = statusItem.button, let window = button.window, window.frame.width > 0 {
            let rect = window.convertToScreen(button.convert(button.bounds, to: nil))
            let visible = (window.screen ?? NSScreen.main!).visibleFrame
            origin = NSPoint(x: rect.midX - size.width / 2, y: rect.minY - size.height - 6)
            origin.x = min(max(origin.x, visible.minX + 8), visible.maxX - size.width - 8)
        } else {
            // Icono oculto (barra llena o tapado por el notch): arriba a la derecha.
            let visible = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame
            origin = NSPoint(x: visible.maxX - size.width - 12, y: visible.maxY - size.height - 6)
        }
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
        panel.alphaValue = 0
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(panelView)
        statusItem.button?.highlight(true)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.14
            panel.animator().alphaValue = 1
        }
        send(["type": "shown"], to: panelView)
    }

    private func hidePanel() {
        guard panel.isVisible else { return }
        lastHide = Date()
        statusItem.button?.highlight(false)
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.12
            panel.animator().alphaValue = 0
        }, completionHandler: { [weak self] in
            guard let self, self.panel.alphaValue == 0 else { return }
            self.panel.orderOut(nil)
        })
    }

    func windowDidResignKey(_ notification: Notification) {
        if (notification.object as? NSWindow) === panel { hidePanel() }
    }

    // MARK: Ventana de la app: atajos y ajustes (opaca)

    private func showSettings() {
        hidePanel()
        if settingsWindow == nil {
            let size = Self.settingsSize
            let view = makeWebView(page: "settings", size: size)
            let window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                                  styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
                                  backing: .buffered, defer: false)
            window.title = "Stash"
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.backgroundColor = .windowBackgroundColor
            window.isReleasedWhenClosed = false
            window.collectionBehavior = [.fullScreenNone]
            window.delegate = self

            let content = NSView(frame: NSRect(origin: .zero, size: size))
            view.frame = content.bounds
            content.addSubview(view)
            let strip = DragStrip(frame: NSRect(x: 80, y: size.height - 52, width: size.width - 80, height: 52))
            strip.autoresizingMask = [.width, .minYMargin]
            content.addSubview(strip)
            window.contentView = content
            window.center()
            settingsWindow = window
            settingsView = view
        } else {
            send(["type": "shown"], to: settingsView)
        }
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow?.makeKeyAndOrderFront(nil)
    }

    // MARK: Interfaz → Swift

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        let id = body["id"] as? String ?? ""
        switch type {
        case "ready":
            guard let view = message.webView else { return }
            ready.insert(ObjectIdentifier(view))
            pushHistory(to: view)
            send(settingsEvent(), to: view)
        case "copy":
            guard let item = store.item(id) else { return }
            watcher.copy(item, plain: body["plain"] as? Bool ?? false)
            store.touch(id)
            hidePanel()
            flashCopied()
        case "pin":
            store.togglePin(id)
        case "remove":
            store.remove(id)
        case "clear":
            store.clear(keepPinned: body["keepPinned"] as? Bool ?? true)
        case "open":
            guard let item = store.item(id) else { return }
            if item.kind == "file", let files = item.files, !files.isEmpty {
                NSWorkspace.shared.activateFileViewerSelecting(files.map { URL(fileURLWithPath: $0) })
            } else if item.kind == "link", let text = item.text,
                      let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)) {
                NSWorkspace.shared.open(url)
            } else if item.kind == "image" {
                NSWorkspace.shared.open(Paths.blob("\(item.id).png"))
            }
            hidePanel()
        case "close":
            if message.webView === panelView { hidePanel() } else { settingsWindow?.performClose(nil) }
        case "settings":
            if let limit = body["limit"] as? Int, limit > 0 { store.limit = limit }
            if let paused = body["paused"] as? Bool { setPaused(paused) }
            if let login = body["launchAtLogin"] as? Bool { setLaunchAtLogin(login) }
            if let lang = body["lang"] as? String { english = lang == "en" }
            broadcastSettings()
        case "openSettings":
            showSettings()
        case "reveal":
            NSWorkspace.shared.activateFileViewerSelecting([Paths.history])
        case "quit":
            NSApp.terminate(nil)
        default:
            break
        }
    }

    // MARK: Swift → interfaz

    private var views: [WKWebView] { [panelView, settingsView].compactMap { $0 } }

    private func scheduleHistoryPush() {
        pushWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.views.forEach { self.pushHistory(to: $0) }
        }
        pushWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: work)
    }

    private func pushHistory(to view: WKWebView) {
        guard ready.contains(ObjectIdentifier(view)), let data = try? JSONEncoder().encode(store.items),
              let json = String(data: data, encoding: .utf8) else { return }
        view.evaluateJavaScript("window.__native && window.__native({type:'history',items:\(json)})")
    }

    private func settingsEvent() -> [String: Any] {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        return ["type": "settings", "limit": store.limit, "paused": watcher.paused,
                "launchAtLogin": SMAppService.mainApp.status == .enabled, "shortcut": "⌥⌘V",
                "version": version, "lang": english ? "en" : "es"]
    }

    private func broadcastSettings() {
        // El estado del inicio de sesión tarda un instante en cambiar.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            guard let self else { return }
            let event = self.settingsEvent()
            self.views.forEach { self.send(event, to: $0) }
        }
    }

    private func send(_ event: [String: Any], to view: WKWebView?) {
        guard let view, ready.contains(ObjectIdentifier(view)),
              let data = try? JSONSerialization.data(withJSONObject: event),
              let json = String(data: data, encoding: .utf8) else { return }
        view.evaluateJavaScript("window.__native && window.__native(\(json))")
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.request.url?.scheme == "app" ? .allow : .cancel)
    }

    // MARK: Menú principal (invisible, pero sin él no funcionan ⌘C, ⌘V, ⌘A, ⌘W)

    private func buildMainMenu() {
        let main = NSMenu()
        let app = NSMenu()
        app.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let window = NSMenu(title: "Window")
        window.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        window.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        for menu in [app, edit, window] {
            let item = NSMenuItem()
            item.submenu = menu
            main.addItem(item)
        }
        NSApp.mainMenu = main
    }
}

// La app se llamaba Pinza: su historial y sus ajustes pasan a Stash la primera vez.
func migrateFromPinza() {
    let files = FileManager.default
    let base = files.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    let old = base.appendingPathComponent("Pinza"), new = base.appendingPathComponent("Stash")
    if files.fileExists(atPath: old.path), !files.fileExists(atPath: new.appendingPathComponent("history.json").path) {
        try? files.removeItem(at: new)
        try? files.moveItem(at: old, to: new)
    }
    let defaults = UserDefaults.standard
    if !defaults.bool(forKey: "migratedFromPinza"), let previous = UserDefaults(suiteName: "local.pinza") {
        for key in ["limit", "paused", "lang"] {
            if let value = previous.object(forKey: key) { defaults.set(value, forKey: key) }
        }
        defaults.set(true, forKey: "migratedFromPinza")
    }
}

migrateFromPinza()
let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
application.run()
