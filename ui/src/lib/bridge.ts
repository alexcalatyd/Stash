// Puente con Swift (WKWebView). En el navegador (`npm run dev`) se simula con
// un historial de ejemplo para poder trabajar la interfaz.

export type Kind = 'text' | 'link' | 'color' | 'image' | 'file'

export interface Item {
  id: string
  kind: Kind
  text?: string
  files?: string[]
  width?: number
  height?: number
  bytes?: number
  rich?: boolean
  app?: string
  bundle?: string
  date: number
  pinned: boolean
}

export interface Settings {
  limit: number
  paused: boolean
  launchAtLogin: boolean
  shortcut: string
  version: string
  lang: 'es' | 'en'
}

export type NativeEvent =
  | { type: 'history'; items: Item[] }
  | ({ type: 'settings' } & Settings)
  | { type: 'shown' }
  | { type: 'hidden' }

type Outgoing =
  | { type: 'ready' }
  | { type: 'copy'; id: string; plain?: boolean }
  | { type: 'pin'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'open'; id: string }
  | { type: 'clear'; keepPinned: boolean }
  | { type: 'close' }
  | { type: 'quit' }
  | { type: 'reveal' }
  | { type: 'openSettings' }
  | { type: 'settings'; limit?: number; paused?: boolean; launchAtLogin?: boolean; lang?: 'es' | 'en' }

declare global {
  interface Window {
    webkit?: { messageHandlers?: { stash?: { postMessage(m: Outgoing): void } } }
    __native?: (e: NativeEvent) => void
  }
}

const handler = window.webkit?.messageHandlers?.stash
export const isNative = !!handler
/** La misma interfaz sirve el panel de la barra (#panel) y la ventana de la app (#settings). */
export const page: 'panel' | 'settings' = location.hash === '#settings' ? 'settings' : 'panel'
document.documentElement.classList.add(page)
if (!isNative) document.documentElement.classList.add('in-browser')

const listeners = new Set<(e: NativeEvent) => void>()
window.__native = (e) => listeners.forEach((l) => l(e))

export function onNativeEvent(listener: (e: NativeEvent) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function send(message: Outgoing) {
  if (handler) handler.postMessage(message)
  else simulate(message)
}

export const blob = (name: string) => (isNative ? `app://local/__blob/${name}` : mockImage)
export const appIcon = (bundle?: string) => (bundle && isNative ? `app://local/__icon/${bundle}` : undefined)

// ── Simulación para el navegador ────────────────────────────────────────────

const mockImage =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a8b"/><stop offset=".5" stop-color="#a18cd1"/><stop offset="1" stop-color="#5ee7df"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><circle cx="460" cy="140" r="70" fill="#fff" opacity=".35"/></svg>`,
  )

const min = 60_000
let mock: Item[] = [
  { id: '1', kind: 'text', text: 'Reunión con el equipo de diseño el jueves a las 10:30 para revisar los componentes del panel', app: 'Notas', date: Date.now() - 20_000, pinned: false },
  { id: '2', kind: 'link', text: 'https://ui.shadcn.com/docs/components/command', app: 'Safari', date: Date.now() - 4 * min, pinned: false },
  { id: '3', kind: 'color', text: '#0A84FF', app: 'Figma', date: Date.now() - 12 * min, pinned: false },
  { id: '4', kind: 'image', width: 2880, height: 1800, bytes: 1_840_000, app: 'Captura de pantalla', date: Date.now() - 40 * min, pinned: false },
  { id: '5', kind: 'text', text: 'git commit -m "feat: historial con búsqueda y filtros"\ngit push origin main', app: 'Terminal', date: Date.now() - 90 * min, pinned: true },
  { id: '6', kind: 'file', text: 'Presupuesto 2027.pdf\nlogo.svg', files: ['/Users/me/Documents/Presupuesto 2027.pdf', '/Users/me/Desktop/logo.svg'], app: 'Finder', date: Date.now() - 3 * 60 * min, pinned: false },
  { id: '7', kind: 'color', text: 'oklch(0.72 0.19 150)', app: 'Visual Studio Code', date: Date.now() - 26 * 60 * min, pinned: false },
  { id: '8', kind: 'text', text: 'Calle Ejemplo 1, 2º A\n28000 Madrid', app: 'Mail', date: Date.now() - 28 * 60 * min, pinned: true },
  { id: '9', kind: 'text', text: `export function useDebounce<T>(value: T, delay = 200) {\n  const [v, setV] = useState(value)\n  useEffect(() => {\n    const t = setTimeout(() => setV(value), delay)\n    return () => clearTimeout(t)\n  }, [value, delay])\n  return v\n}`, app: 'Visual Studio Code', date: Date.now() - 3 * 24 * 60 * min, pinned: false, rich: true },
  { id: '10', kind: 'link', text: 'https://magicui.design/docs/components/blur-fade', app: 'Arc', date: Date.now() - 9 * 24 * 60 * min, pinned: false },
]
let mockSettings: Settings = { limit: 500, paused: false, launchAtLogin: true, shortcut: '⌥⌘V', version: '1.0', lang: 'es' }

function emit(e: NativeEvent) {
  setTimeout(() => window.__native?.(e), 0)
}

function simulate(m: Outgoing) {
  const push = () => emit({ type: 'history', items: [...mock] })
  switch (m.type) {
    case 'ready':
      push()
      emit({ type: 'settings', ...mockSettings })
      emit({ type: 'shown' })
      break
    case 'copy': {
      const item = mock.find((i) => i.id === m.id)
      if (item) mock = [{ ...item, date: Date.now() }, ...mock.filter((i) => i !== item)]
      push()
      console.info('[stash] copiado', item?.text ?? item?.kind, m.plain ? '(sin formato)' : '')
      break
    }
    case 'pin':
      mock = mock.map((i) => (i.id === m.id ? { ...i, pinned: !i.pinned } : i))
      push()
      break
    case 'remove':
      mock = mock.filter((i) => i.id !== m.id)
      push()
      break
    case 'clear':
      mock = m.keepPinned ? mock.filter((i) => i.pinned) : []
      push()
      break
    case 'settings': {
      const { type: _, ...rest } = m
      mockSettings = { ...mockSettings, ...rest }
      emit({ type: 'settings', ...mockSettings })
      break
    }
    default:
      console.info('[stash]', m)
  }
}
