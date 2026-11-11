import AppKit

// Icono de Stash (1024 px): placa grafito como la de Tap y dos hojas superpuestas.
// Uso: swift icon.swift salida.png

let size: CGFloat = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let ctx = NSGraphicsContext.current!.cgContext
let space = CGColorSpaceCreateDeviceRGB()

let plate = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = CGPath(roundedRect: plate, cornerWidth: 186, cornerHeight: 186, transform: nil)

ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 24, color: NSColor.black.withAlphaComponent(0.32).cgColor)
ctx.addPath(shape); ctx.setFillColor(NSColor(calibratedWhite: 0.12, alpha: 1).cgColor); ctx.fillPath()
ctx.restoreGState()

ctx.saveGState()
ctx.addPath(shape); ctx.clip()
let body = CGGradient(colorsSpace: space, colors: [
    NSColor(calibratedRed: 0.235, green: 0.235, blue: 0.25, alpha: 1).cgColor,
    NSColor(calibratedRed: 0.09, green: 0.09, blue: 0.10, alpha: 1).cgColor,
] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(body, start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 100),
                       options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
ctx.restoreGState()

ctx.saveGState()
ctx.addPath(CGPath(roundedRect: plate.insetBy(dx: 2.5, dy: 2.5), cornerWidth: 183.5, cornerHeight: 183.5, transform: nil))
ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.12).cgColor)
ctx.setLineWidth(5); ctx.strokePath()
ctx.restoreGState()

// Hoja de atrás (solo contorno, más tenue) y hoja de delante (contorno blanco).
let white = NSColor(calibratedWhite: 0.96, alpha: 1)
ctx.setLineWidth(52)
ctx.setLineJoin(.round)
let back = CGRect(x: 402, y: 402, width: 300, height: 300)
let front = CGRect(x: 322, y: 322, width: 300, height: 300)

ctx.saveGState()
// La hoja de atrás no se ve por debajo de la de delante.
ctx.addRect(CGRect(x: 0, y: 0, width: size, height: size))
ctx.addPath(CGPath(roundedRect: front.insetBy(dx: -50, dy: -50), cornerWidth: 110, cornerHeight: 110, transform: nil))
ctx.clip(using: .evenOdd)
ctx.addPath(CGPath(roundedRect: back, cornerWidth: 72, cornerHeight: 72, transform: nil))
ctx.setStrokeColor(white.withAlphaComponent(0.5).cgColor); ctx.strokePath()
ctx.restoreGState()

ctx.addPath(CGPath(roundedRect: front, cornerWidth: 72, cornerHeight: 72, transform: nil))
ctx.setStrokeColor(white.cgColor); ctx.strokePath()

image.unlockFocus()
let png = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
