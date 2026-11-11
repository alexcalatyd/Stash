// Idioma de la interfaz (español o inglés). Lo guarda Swift para que el panel,
// la ventana y el menú de la barra vayan siempre a la par.

import { useSyncExternalStore } from 'react'

export type Lang = 'es' | 'en'

const es = {
  search: 'Buscar',
  emptyTitle: 'Nada copiado todavía',
  emptyHint: 'Copia algo con ⌘C y aparecerá aquí.',
  noResults: 'Sin resultados',
  paused: 'Captura en pausa',
  resume: 'Reanudar',
  image: 'Imagen',
  now: 'ahora',
  min: (n: number) => `${n} min`,
  hours: (n: number) => `${n} h`,
  yesterday: 'ayer',
  more: (n: number) => `y ${n} más`,
  chars: (n: number) => `${n.toLocaleString('es')} caracteres`,
  words: (n: number) => `${n.toLocaleString('es')} palabras`,
  lines: (n: number) => `${n.toLocaleString('es')} líneas`,
  files: (n: number) => `${n} ${n === 1 ? 'archivo' : 'archivos'}`,
  copy: 'Copiar',
  plain: 'Sin formato',
  open: 'Abrir',
  show: 'Mostrar',
  pin: 'Fijar',
  unpin: 'Desfijar',
  remove: 'Eliminar',
  close: 'Cerrar',
  kinds: { text: 'Texto', link: 'Enlace', color: 'Color', image: 'Imagen', file: 'Archivo' },
  // Ventana
  heroHint: 'Abre tu historial desde cualquier app',
  inHistory: 'En el historial',
  copyPlain: 'Copiar sin formato',
  quickCopy: 'Copiar los nueve primeros',
  preview: 'Vista previa',
  settings: 'Ajustes',
  atLogin: 'Abrir al iniciar sesión',
  atLoginHint: 'Para guardar todo lo que copias, siempre.',
  pause: 'Pausar captura',
  keep: 'Guardar',
  keepHint: 'Los fijados no cuentan.',
  clear: 'Borrar historial',
  clearSure: '¿Seguro?',
  items: (n: number) => `${n.toLocaleString('es')} ${n === 1 ? 'elemento' : 'elementos'}`,
  quit: 'Salir',
  quitStash: 'Salir de Stash',
  copied: 'Copiado',
  language: 'Idioma: español. Cambiar a inglés',
}

const en: typeof es = {
  search: 'Search',
  emptyTitle: 'Nothing copied yet',
  emptyHint: 'Copy something with ⌘C and it will show up here.',
  noResults: 'No results',
  paused: 'Capture paused',
  resume: 'Resume',
  image: 'Image',
  now: 'now',
  min: (n) => `${n} min`,
  hours: (n) => `${n} h`,
  yesterday: 'yesterday',
  more: (n) => `and ${n} more`,
  chars: (n) => `${n.toLocaleString('en')} characters`,
  words: (n) => `${n.toLocaleString('en')} words`,
  lines: (n) => `${n.toLocaleString('en')} lines`,
  files: (n) => `${n} ${n === 1 ? 'file' : 'files'}`,
  copy: 'Copy',
  plain: 'Plain text',
  open: 'Open',
  show: 'Show',
  pin: 'Pin',
  unpin: 'Unpin',
  remove: 'Delete',
  close: 'Close',
  kinds: { text: 'Text', link: 'Link', color: 'Color', image: 'Image', file: 'File' },
  heroHint: 'Open your history from any app',
  inHistory: 'In the history',
  copyPlain: 'Copy as plain text',
  quickCopy: 'Copy one of the first nine',
  preview: 'Preview',
  settings: 'Settings',
  atLogin: 'Open at login',
  atLoginHint: 'So everything you copy is always saved.',
  pause: 'Pause capture',
  keep: 'Keep',
  keepHint: 'Pinned items don’t count.',
  clear: 'Clear history',
  clearSure: 'Are you sure?',
  items: (n) => `${n.toLocaleString('en')} ${n === 1 ? 'item' : 'items'}`,
  quit: 'Quit',
  quitStash: 'Quit Stash',
  copied: 'Copied',
  language: 'Language: English. Switch to Spanish',
}

export type Strings = typeof es
const strings: Record<Lang, Strings> = { es, en }

let current: Lang = navigator.language.startsWith('es') ? 'es' : 'en'
const subscribers = new Set<() => void>()

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  document.documentElement.lang = lang
  subscribers.forEach((s) => s())
}

const subscribe = (s: () => void) => {
  subscribers.add(s)
  return () => {
    subscribers.delete(s)
  }
}

export const useLang = () => useSyncExternalStore(subscribe, () => current)
export const useStrings = () => strings[useLang()]
