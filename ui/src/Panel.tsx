import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Power, Search, Settings2, X } from 'lucide-react'
import { onNativeEvent, send, type Item, type Settings } from '@/lib/bridge'
import { setLang, useStrings } from '@/lib/i18n'
import { matches, tokens } from '@/lib/utils'
import { ItemRow } from '@/components/ItemRow'
import { Preview } from '@/components/Preview'

const RENDER_LIMIT = 200

// Panel de la barra de menús: un buscador y la lista. Nada más.
export default function Panel() {
  const t = useStrings()
  const [items, setItems] = useState<Item[]>([])
  const [paused, setPaused] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [preview, setPreview] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [opening, setOpening] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = onNativeEvent((e) => {
      if (e.type === 'history') setItems(e.items)
      else if (e.type === 'settings') {
        setPaused(e.paused)
        setLang((e as Settings).lang)
      } else if (e.type === 'shown') {
        setQuery('')
        setSelected(0)
        setPreview(false)
        setCopied(null)
        setNow(Date.now())
        setOpening((n) => n + 1)
        list.current?.scrollTo({ top: 0 })
        requestAnimationFrame(() => input.current?.focus())
      }
    })
    send({ type: 'ready' })
    return off
  }, [])

  const terms = useMemo(() => tokens(query), [query])
  const visible = useMemo(() => {
    const found = items.filter((i) => matches(i, terms))
    return terms.length ? found : [...found.filter((i) => i.pinned), ...found.filter((i) => !i.pinned)]
  }, [items, terms])
  const shown = visible.slice(0, RENDER_LIMIT)
  const current = shown[selected] as Item | undefined

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, shown.length - 1)))
  }, [shown.length])
  useEffect(() => {
    if (!current) setPreview(false)
  }, [current])
  useEffect(() => {
    list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // Un instante de confirmación en la fila antes de que el panel se cierre.
  const copy = useCallback((item: Item, plain = false) => {
    setCopied(item.id)
    setTimeout(() => send({ type: 'copy', id: item.id, plain }), 240)
  }, [])
  const pin = useCallback((item: Item) => send({ type: 'pin', id: item.id }), [])
  const remove = useCallback((item: Item) => send({ type: 'remove', id: item.id }), [])

  const onKeyDown = (e: KeyboardEvent) => {
    const cmd = e.metaKey
    if (e.key === 'Escape') {
      e.preventDefault()
      if (preview) setPreview(false)
      else if (query) setQuery('')
      else send({ type: 'close' })
      return
    }
    const move = (to: number) => {
      e.preventDefault()
      setSelected(Math.max(0, Math.min(shown.length - 1, to)))
    }
    if (e.key === 'ArrowDown') return move(cmd ? shown.length - 1 : selected + 1)
    if (e.key === 'ArrowUp') return move(cmd ? 0 : selected - 1)
    if (cmd && /^[1-9]$/.test(e.key)) {
      e.preventDefault()
      const item = shown[Number(e.key) - 1]
      if (item) copy(item)
      return
    }
    if (!current) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (cmd) send({ type: 'open', id: current.id })
      else copy(current, e.shiftKey)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      setPreview((v) => !v)
    } else if (cmd && e.key.toLowerCase() === 'p') {
      e.preventDefault()
      pin(current)
    } else if (cmd && e.key === 'Backspace' && !query) {
      e.preventDefault()
      remove(current)
    }
  }
  const keyHandler = useRef(onKeyDown)
  keyHandler.current = onKeyDown
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <motion.div
      key={opening}
      initial={{ opacity: 0.4, y: -6, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ type: 'spring', stiffness: 480, damping: 36 }}
      className="relative flex h-full flex-col"
      onMouseDown={(e) => {
        // El foco se queda siempre en el buscador.
        if (!(e.target as HTMLElement).closest('input, .select-text')) e.preventDefault()
      }}
    >
      <div className="p-3 pb-2">
        <label className="raised flex h-10 items-center gap-2.5 rounded-full px-3.5 transition-shadow">
          <Search size={15} strokeWidth={2.2} className="shrink-0 text-[var(--label-3)]" />
          <input
            ref={input}
            autoFocus
            value={query}
            spellCheck={false}
            autoComplete="off"
            placeholder={t.search}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
              list.current?.scrollTo({ top: 0 })
            }}
            className="min-w-0 flex-1 bg-transparent text-[15px] caret-[var(--accent)] placeholder:text-[var(--label-3)]"
          />
          {query && (
            <button
              aria-label={t.close}
              tabIndex={-1}
              onClick={() => setQuery('')}
              className="grid size-[18px] place-items-center rounded-full bg-[var(--label-3)] text-[var(--window)]"
            >
              <X size={11} strokeWidth={3} />
            </button>
          )}
        </label>
      </div>

      <div ref={list} role="listbox" className="scroll min-h-0 flex-1 px-2 pb-2">
        {shown.length ? (
          shown.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              selected={index === selected}
              copied={copied === item.id}
              terms={terms}
              now={now}
              onSelect={setSelected}
              onCopy={copy}
              onPin={pin}
              onRemove={remove}
            />
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 pb-8 text-center">
            <Sheets />
            <div className="mt-3 text-[13px] font-medium text-[var(--label-2)]">{terms.length ? t.noResults : t.emptyTitle}</div>
            {!terms.length && <div className="text-[12px] text-[var(--label-3)]">{t.emptyHint}</div>}
          </div>
        )}
      </div>

      <footer className="flex h-10 shrink-0 items-center gap-1 pr-2 pl-4">
        {paused ? (
          <button
            onClick={() => send({ type: 'settings', paused: false })}
            className="-ml-2 flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-[var(--label-2)] transition-colors hover:bg-[var(--well)]"
          >
            <span className="size-1.5 rounded-full bg-[orange] shadow-[0_0_6px_orange]" />
            {t.paused} · <span className="text-[var(--accent)]">{t.resume}</span>
          </button>
        ) : (
          <span className="font-[family-name:var(--rounded)] text-[11px] font-semibold tracking-[0.01em] text-[var(--label-3)]">
            Stash
            <span className="font-normal"> · {t.items(items.length)}</span>
          </span>
        )}
        <span className="flex-1" />
        <FooterButton label={t.settings} onClick={() => send({ type: 'openSettings' })}>
          <Settings2 size={14} strokeWidth={2} />
        </FooterButton>
        <FooterButton label={t.quitStash} onClick={() => send({ type: 'quit' })}>
          <Power size={13} strokeWidth={2.2} />
        </FooterButton>
      </footer>

      <AnimatePresence>
        {preview && current && (
          <Preview
            key="preview"
            item={current}
            onClose={() => setPreview(false)}
            onCopy={(plain) => copy(current, plain)}
            onOpen={() => send({ type: 'open', id: current.id })}
            onPin={() => pin(current)}
            onRemove={() => remove(current)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function FooterButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      tabIndex={-1}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full text-[var(--label-3)] transition-[background,color,scale] duration-150 hover:bg-[var(--well)] hover:text-[var(--label)] active:scale-90"
    >
      {children}
    </button>
  )
}

/** El mismo glifo del icono de la app: dos marcos, el de atrás asomando por arriba a la derecha. */
function Sheets() {
  return (
    <svg width="44" height="44" viewBox="296 296 432 432" fill="none" strokeWidth="52" aria-hidden>
      <defs>
        <mask id="stash-back">
          <rect x="0" y="0" width="1024" height="1024" fill="#fff" />
          <rect x="272" y="352" width="400" height="400" rx="110" fill="#000" />
        </mask>
      </defs>
      <rect x="402" y="322" width="300" height="300" rx="72" stroke="var(--label-3)" mask="url(#stash-back)" />
      <rect x="322" y="402" width="300" height="300" rx="72" stroke="var(--label-2)" />
    </svg>
  )
}
