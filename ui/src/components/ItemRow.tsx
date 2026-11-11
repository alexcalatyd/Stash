import { memo } from 'react'
import { motion } from 'motion/react'
import { Check, Pin, X } from 'lucide-react'
import { blob, type Item } from '@/lib/bridge'
import { useLang, useStrings } from '@/lib/i18n'
import { cn, highlight, relative, snippet } from '@/lib/utils'
import { KindIcon } from './KindIcon'

export function looksLikeCode(text: string) {
  return text.includes('\n') && /[{};=<>]|^\s{2,}\S|=>|\bfunction\b|\bconst\b|\$ /m.test(text)
}

function Marked({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlight(text, terms).map((p, i) => (p.hit ? <mark key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>))}
    </>
  )
}

function Tile({ item }: { item: Item }) {
  const base = 'relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[9px]'
  if (item.kind === 'image') {
    return (
      <div className={cn(base, 'checker')}>
        <img src={blob(`${item.id}-thumb.png`)} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
      </div>
    )
  }
  if (item.kind === 'color') {
    return (
      <div className={cn(base, 'checker')}>
        <div className="absolute inset-0 shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.12)]" style={{ background: item.text?.trim() }} />
      </div>
    )
  }
  return (
    <div
      className={cn(
        base,
        item.kind === 'link'
          ? 'bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-[var(--accent)]'
          : 'bg-[var(--well)] text-[var(--label-2)]',
      )}
    >
      <KindIcon kind={item.kind} size={14} many={(item.files?.length ?? 0) > 1} />
    </div>
  )
}

function Title({ item, terms }: { item: Item; terms: string[] }) {
  const t = useStrings()
  const text = item.text ?? ''
  if (item.kind === 'image') {
    return (
      <>
        {t.image} <span className="text-[var(--label-3)]">{item.width} × {item.height}</span>
      </>
    )
  }
  if (item.kind === 'file') {
    const names = text.split('\n')
    return (
      <>
        <Marked text={names[0]} terms={terms} />
        {names.length > 1 && <span className="text-[var(--label-3)]"> {t.more(names.length - 1)}</span>}
      </>
    )
  }
  if (item.kind === 'link') {
    let host = text.trim()
    let rest = ''
    try {
      const u = new URL(host)
      host = u.hostname.replace(/^www\./, '')
      rest = (u.pathname === '/' ? '' : u.pathname) + u.search
    } catch {
      /* se muestra tal cual */
    }
    return (
      <>
        <Marked text={host} terms={terms} />
        <span className="text-[var(--label-3)]">
          <Marked text={rest} terms={terms} />
        </span>
      </>
    )
  }
  return (
    <span className={cn((item.kind === 'color' || looksLikeCode(text)) && 'font-[family-name:var(--mono)] text-[12px]')}>
      <Marked text={snippet(text, terms)} terms={terms} />
    </span>
  )
}

interface Props {
  item: Item
  index: number
  selected: boolean
  copied: boolean
  terms: string[]
  now: number
  onSelect: (index: number) => void
  onCopy: (item: Item) => void
  onPin: (item: Item) => void
  onRemove: (item: Item) => void
}

export const ItemRow = memo(function ItemRow({ item, index, selected, copied, terms, now, onSelect, onCopy, onPin, onRemove }: Props) {
  const t = useStrings()
  const lang = useLang()
  return (
    <motion.div
      data-index={index}
      role="option"
      aria-selected={selected}
      onMouseMove={() => !selected && onSelect(index)}
      onClick={() => onCopy(item)}
      // Entrada escalonada al abrir el panel (como el BlurFade de Magic UI).
      initial={index < 10 ? { opacity: 0, y: 6, filter: 'blur(3px)' } : false}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: index * 0.022, type: 'spring', stiffness: 500, damping: 38 }}
      className="group relative flex h-12 items-center gap-3 rounded-[14px] px-2.5"
    >
      {selected && (
        <motion.div
          layoutId="row-selection"
          className={cn('knob absolute inset-0 rounded-[14px] transition-[background] duration-200', copied && 'bg-[color-mix(in_srgb,var(--accent)_16%,var(--knob))]')}
          transition={{ type: 'spring', stiffness: 700, damping: 48, mass: 0.6 }}
        />
      )}
      <Tile item={item} />
      <div className="relative min-w-0 flex-1">
        <div className="truncate text-[13px] text-[var(--label)]">
          <Title item={item} terms={terms} />
        </div>
        <div className="flex items-center gap-1 truncate text-[11px] text-[var(--label-3)]">
          {item.pinned && <Pin size={9} strokeWidth={2.5} className="shrink-0" />}
          <span className="truncate">
            {item.app ? <Marked text={item.app} terms={terms} /> : null}
            {item.app ? ' · ' : ''}
            {relative(item.date, t, lang, now)}
          </span>
        </div>
      </div>
      {copied && (
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 600, damping: 22 }}
          className="relative grid size-6 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white"
        >
          <Check size={13} strokeWidth={3} />
        </motion.span>
      )}
      <div className={cn('relative hidden shrink-0 items-center', !copied && 'group-hover:flex')}>
        <RowButton label={item.pinned ? t.unpin : t.pin} onClick={() => onPin(item)}>
          <Pin size={12} strokeWidth={2} className={cn(item.pinned && 'fill-current')} />
        </RowButton>
        <RowButton label={t.remove} onClick={() => onRemove(item)}>
          <X size={13} strokeWidth={2} />
        </RowButton>
      </div>
    </motion.div>
  )
})

function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="grid size-6 place-items-center rounded-full text-[var(--label-3)] transition-[background,color,scale] duration-150 hover:bg-[var(--well-2)] hover:text-[var(--label)] active:scale-90"
    >
      {children}
    </button>
  )
}
