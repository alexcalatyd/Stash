import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Radio, RadioGroup, Switch } from 'react-aria-components'
import { onNativeEvent, send, type Settings } from '@/lib/bridge'
import { setLang, useLang, useStrings } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const LIMITS = [100, 500, 1000, 5000]

// La ventana de la app (al abrir Stash.app): atajos y ajustes. Opaca, como Tap.
export default function SettingsWindow() {
  const t = useStrings()
  const lang = useLang()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [count, setCount] = useState(0)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    const off = onNativeEvent((e) => {
      if (e.type === 'settings') {
        setSettings(e)
        setLang(e.lang)
      } else if (e.type === 'history') setCount(e.items.length)
      else if (e.type === 'shown') setConfirm(false)
    })
    send({ type: 'ready' })
    return off
  }, [])

  useEffect(() => {
    if (!confirm) return
    const timer = setTimeout(() => setConfirm(false), 4000)
    return () => clearTimeout(timer)
  }, [confirm])

  const shortcuts: [string, string[]][] = [
    [t.copy, ['↩']],
    [t.copyPlain, ['⇧', '↩']],
    [t.quickCopy, ['⌘', '1–9']],
    [t.preview, ['⇥']],
    [t.pin, ['⌘', 'P']],
    [t.remove, ['⌘', '⌫']],
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="grid h-[52px] shrink-0 place-items-center font-[family-name:var(--rounded)] text-[13px] font-semibold text-[var(--label-2)]">
        Stash
      </header>

      <main className="scroll flex-1 px-5 pb-4">
        {/* El atajo principal, en grande */}
        <section className="flex flex-col items-center pt-3 pb-7">
          <div className="flex gap-2">
            {['⌥', '⌘', 'V'].map((k) => (
              <span
                key={k}
                className="knob grid size-[52px] place-items-center rounded-[14px] font-[family-name:var(--rounded)] text-[22px] font-medium text-[var(--label)]"
              >
                {k}
              </span>
            ))}
          </div>
          <p className="mt-3.5 text-[13px] text-[var(--label-2)]">{t.heroHint}</p>
        </section>

        <Title>{t.inHistory}</Title>
        <Card>
          {shortcuts.map(([label, keys]) => (
            <div key={label} className="flex h-9 items-center px-4">
              <span className="flex-1 text-[13px]">{label}</span>
              <span className="flex gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="grid h-[22px] min-w-[22px] place-items-center rounded-[6px] bg-[var(--well)] px-1.5 font-sans text-[11.5px] text-[var(--label-2)]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </Card>

        <Title>{t.settings}</Title>
        {settings && (
          <Card>
            <Toggle
              label={t.atLogin}
              hint={t.atLoginHint}
              value={settings.launchAtLogin}
              onChange={(v) => send({ type: 'settings', launchAtLogin: v })}
            />
            <Toggle label={t.pause} value={settings.paused} onChange={(v) => send({ type: 'settings', paused: v })} />
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1">
                <div className="text-[13px]">{t.keep}</div>
                <div className="text-[11.5px] text-[var(--label-3)]">{t.keepHint}</div>
              </div>
              <RadioGroup
                aria-label={t.keep}
                orientation="horizontal"
                value={String(settings.limit)}
                onChange={(v) => send({ type: 'settings', limit: Number(v) })}
                className="flex h-[30px] rounded-full bg-[var(--well)] p-[3px] shadow-[inset_0_0_0_0.5px_var(--edge)]"
              >
                {LIMITS.map((n) => (
                  <Radio
                    key={n}
                    value={String(n)}
                    className={({ isSelected }) =>
                      cn(
                        'relative grid min-w-[44px] place-items-center rounded-full px-2 text-[12px] font-semibold tabular-nums transition-colors duration-200',
                        isSelected ? 'text-[var(--label)]' : 'text-[var(--label-2)] hover:text-[var(--label)]',
                      )
                    }
                  >
                    {({ isSelected }) => (
                      <>
                        {isSelected && (
                          <motion.span
                            layoutId="limit-knob"
                            className="knob absolute inset-0 rounded-full"
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                          />
                        )}
                        <span className="relative">{n >= 1000 ? `${n / 1000}k` : n}</span>
                      </>
                    )}
                  </Radio>
                ))}
              </RadioGroup>
            </div>
            <div className="flex items-center px-4 py-2.5">
              <span className="flex-1 text-[13px]">{confirm ? t.clearSure : t.clear}</span>
              <button
                onClick={() => {
                  if (!confirm) return setConfirm(true)
                  send({ type: 'clear', keepPinned: true })
                  setConfirm(false)
                }}
                className={cn(
                  'h-7 rounded-full px-3.5 text-[12px] font-semibold transition-[background,color,scale] duration-200 active:scale-95',
                  confirm ? 'bg-[var(--danger)] text-white' : 'bg-[var(--well)] text-[var(--danger)] hover:bg-[var(--well-2)]',
                )}
              >
                {t.clear.split(' ')[0]}
              </button>
            </div>
          </Card>
        )}
      </main>

      <footer className="flex h-11 shrink-0 items-center gap-2 px-4 text-[12px] text-[var(--label-3)]">
        <button
          onClick={() => send({ type: 'reveal' })}
          className="rounded-full px-2.5 py-1 tabular-nums transition-colors hover:bg-[var(--well)] hover:text-[var(--label-2)]"
        >
          {t.items(count)}
        </button>
        <span className="flex-1" />
        <button
          onClick={() => send({ type: 'quit' })}
          className="rounded-full px-2.5 py-1 transition-colors hover:bg-[var(--well)] hover:text-[var(--label-2)]"
        >
          {t.quit}
        </button>
        <button
          onClick={() => send({ type: 'settings', lang: lang === 'es' ? 'en' : 'es' })}
          aria-label={t.language}
          title={t.language}
          className="grid h-6 min-w-8 place-items-center overflow-hidden rounded-full bg-[var(--well)] px-2 text-[11px] font-semibold text-[var(--label-2)] transition-colors hover:text-[var(--label)]"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={lang}
              initial={{ opacity: 0, y: 5, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -5, filter: 'blur(3px)' }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            >
              {lang.toUpperCase()}
            </motion.span>
          </AnimatePresence>
        </button>
      </footer>
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1.5 px-4 text-[12px] font-medium text-[var(--label-3)]">{children}</h2>
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-6 divide-y divide-[var(--edge)] overflow-hidden rounded-[14px] bg-[var(--card)] shadow-[0_0_0_0.5px_var(--edge),0_1px_2px_rgba(0,0,0,0.04)]">
      {children}
    </section>
  )
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch isSelected={value} onChange={onChange} className="flex items-center gap-3 px-4 py-2.5">
      {({ isSelected, isFocusVisible }) => (
        <>
          <div className="min-w-0 flex-1">
            <div className="text-[13px]">{label}</div>
            {hint && <div className="text-[11.5px] text-[var(--label-3)]">{hint}</div>}
          </div>
          <div
            className={cn(
              'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200',
              isSelected ? 'bg-[var(--accent)]' : 'bg-[var(--well-2)]',
              isFocusVisible && 'ring-2 ring-[var(--accent)] ring-offset-1',
            )}
          >
            <motion.div
              className="absolute top-[2px] left-[2px] size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
              animate={{ x: isSelected ? 16 : 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 36 }}
            />
          </div>
        </>
      )}
    </Switch>
  )
}
