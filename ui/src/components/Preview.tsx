import { useMemo } from 'react'
import { motion } from 'motion/react'
import { Pin, X } from 'lucide-react'
import { blob, type Item } from '@/lib/bridge'
import { useLang, useStrings } from '@/lib/i18n'
import { bytes, cn, fullDate } from '@/lib/utils'
import { looksLikeCode } from './ItemRow'

/** Convierte cualquier color CSS a HEX y RGB con el propio motor del navegador. */
function colorFormats(value: string) {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return []
  ctx.fillStyle = '#000'
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [
    '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase(),
    `rgb(${r}, ${g}, ${b})`,
  ]
}

interface Props {
  item: Item
  onClose: () => void
  onCopy: (plain?: boolean) => void
  onOpen: () => void
  onPin: () => void
  onRemove: () => void
}

// Vista previa (⇥): hoja opaca sobre el panel.
export function Preview({ item, onClose, onCopy, onOpen, onPin, onRemove }: Props) {
  const t = useStrings()
  const lang = useLang()
  const text = item.text ?? ''

  const facts = useMemo(() => {
    if (item.kind === 'image') return [`${item.width} × ${item.height}`, item.bytes ? bytes(item.bytes) : '']
    if (item.kind === 'file') return [t.files(item.files?.length ?? 0)]
    if (item.kind === 'text') {
      const words = text.trim() ? text.trim().split(/\s+/).length : 0
      return [t.chars(text.length), t.words(words), t.lines(text.split('\n').length)]
    }
    return []
  }, [item, text, t])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
      className="absolute inset-0 z-20 flex flex-col bg-[var(--sheet)]"
    >
      <header className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{t.kinds[item.kind]}</div>
          <div className="truncate text-[11px] text-[var(--label-3)] first-letter:uppercase">
            {item.app ? `${item.app} · ` : ''}
            {fullDate(item.date, lang)}
          </div>
        </div>
        <IconButton label={item.pinned ? t.unpin : t.pin} onClick={onPin}>
          <Pin size={13} strokeWidth={2} className={cn(item.pinned && 'fill-current')} />
        </IconButton>
        <IconButton label={t.close} onClick={onClose}>
          <X size={14} strokeWidth={2} />
        </IconButton>
      </header>

      <div className="scroll mx-3 min-h-0 flex-1 rounded-[14px] bg-[var(--well)] select-text [-webkit-user-select:text]">
        {item.kind === 'image' && (
          <div className="checker grid h-full place-items-center p-3">
            <img src={blob(`${item.id}.png`)} alt="" draggable={false} className="max-h-full max-w-full rounded-[6px] object-contain" />
          </div>
        )}
        {item.kind === 'color' && (
          <div className="flex h-full flex-col gap-3 p-3">
            <div className="checker flex-1 overflow-hidden rounded-[10px]">
              <div className="size-full" style={{ background: text.trim() }} />
            </div>
            <div className="flex justify-between px-1 font-[family-name:var(--mono)] text-[12px] text-[var(--label-2)]">
              {[text.trim(), ...colorFormats(text.trim())]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((v) => (
                  <span key={v}>{v}</span>
                ))}
            </div>
          </div>
        )}
        {item.kind === 'file' && (
          <ul className="space-y-2 p-3.5">
            {item.files?.map((f) => (
              <li key={f}>
                <div className="text-[13px]">{f.split('/').pop()}</div>
                <div className="truncate text-[11px] text-[var(--label-3)]">{f}</div>
              </li>
            ))}
          </ul>
        )}
        {(item.kind === 'text' || item.kind === 'link') && (
          <pre
            className={cn(
              'p-3.5 break-words whitespace-pre-wrap',
              looksLikeCode(text) ? 'font-[family-name:var(--mono)] text-[12px] leading-[1.55]' : 'font-sans text-[13px] leading-[1.5]',
            )}
          >
            {text}
          </pre>
        )}
      </div>

      <footer className="flex items-center gap-2 px-4 py-3">
        <span className="flex-1 truncate text-[11px] text-[var(--label-3)]">{facts.filter(Boolean).join(' · ')}</span>
        <TextButton onClick={onRemove}>{t.remove}</TextButton>
        {item.rich && <TextButton onClick={() => onCopy(true)}>{t.plain}</TextButton>}
        {(item.kind === 'link' || item.kind === 'file' || item.kind === 'image') && (
          <TextButton onClick={onOpen}>{item.kind === 'file' ? t.show : t.open}</TextButton>
        )}
        <button
          onClick={() => onCopy()}
          className="h-7 rounded-full bg-[var(--accent)] px-3.5 text-[12px] font-semibold text-white transition-[scale,filter] duration-150 hover:brightness-110 active:scale-95"
        >
          {t.copy}
        </button>
      </footer>
    </motion.div>
  )
}

function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-7 rounded-full px-2.5 text-[12px] text-[var(--label-2)] transition-[background,color,scale] duration-150 hover:bg-[var(--well)] hover:text-[var(--label)] active:scale-95"
    >
      {children}
    </button>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full text-[var(--label-2)] transition-[background,color,scale] duration-150 hover:bg-[var(--well)] hover:text-[var(--label)] active:scale-95"
    >
      {children}
    </button>
  )
}
