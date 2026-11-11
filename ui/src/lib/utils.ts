import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Item } from './bridge'
import type { Strings } from './i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function startOfDay(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** «ahora», «3 min», «2 h», «ayer», «12 nov». */
export function relative(ms: number, t: Strings, lang: string, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000)
  if (s < 45) return t.now
  if (s < 3600) return t.min(Math.round(s / 60))
  const today = startOfDay(now)
  if (ms >= today) return t.hours(Math.round(s / 3600))
  if (ms >= today - 86_400_000) return t.yesterday
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(ms).replace('.', '')
}

export const fullDate = (ms: number, lang: string) =>
  new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'short' }).format(ms)

export function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

/** Normaliza para buscar sin tildes ni mayúsculas. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function tokens(query: string) {
  return fold(query).split(/\s+/).filter(Boolean)
}

export function matches(item: Item, terms: string[]) {
  if (!terms.length) return true
  const hay = fold(`${item.text ?? ''} ${item.app ?? ''} ${(item.files ?? []).join(' ')}`)
  return terms.every((t) => hay.includes(t))
}

/** Línea de vista previa: si la coincidencia está lejos del inicio, se recorta a su alrededor. */
export function snippet(text: string, terms: string[]) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!terms.length) return flat.slice(0, 400)
  const at = fold(flat).indexOf(terms[0])
  if (at < 50) return flat.slice(0, 400)
  return '…' + flat.slice(at - 24, at + 380)
}

/** Parte un texto en trozos marcando las coincidencias de búsqueda. */
export function highlight(text: string, terms: string[]): { t: string; hit: boolean }[] {
  if (!terms.length) return [{ t: text, hit: false }]
  const chars = Array.from(text)
  let folded = ''
  const owner: number[] = [] // carácter original de cada posición del texto normalizado
  chars.forEach((c, index) => {
    const f = fold(c)
    folded += f
    for (let k = 0; k < f.length; k++) owner.push(index)
  })
  const marks = new Array<boolean>(chars.length).fill(false)
  for (const term of terms) {
    let i = folded.indexOf(term)
    while (i !== -1) {
      for (let k = i; k < i + term.length; k++) marks[owner[k]] = true
      i = folded.indexOf(term, i + term.length)
    }
  }
  const out: { t: string; hit: boolean }[] = []
  chars.forEach((c, i) => {
    const last = out[out.length - 1]
    if (last && last.hit === marks[i]) last.t += c
    else out.push({ t: c, hit: marks[i] })
  })
  return out
}
