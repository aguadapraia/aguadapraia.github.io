import {
  Check,
  Languages,
  Moon,
  Settings,
  Sun,
  SunMoon,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getCopy } from '../i18n'
import type { Settings as AppSettings } from '../lib/settings'

interface SettingsPanelProps {
  settings: AppSettings
  onSettingsChange: (next: AppSettings) => void
  isMobile?: boolean
}

interface SegmentRowProps<Value extends string> {
  label: string
  icon: LucideIcon
  value: Value
  options: Array<{ value: Value; label: string; icon?: LucideIcon }>
  onChange: (value: Value) => void
}

function SegmentRow<Value extends string>({
  label,
  icon: Icon,
  value,
  options,
  onChange,
}: SegmentRowProps<Value>) {
  return (
    <div className="sp-segment" role="group" aria-label={label}>
      <span className="sp-segment-label">
        <Icon size={16} aria-hidden="true" />{label}
      </span>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'sp-choice active' : 'sp-choice'}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="sp-choice-mark" aria-hidden="true">
              {value === option.value ? <Check size={14} /> : option.icon ? <option.icon size={14} /> : null}
            </span>{option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPanel({ settings, onSettingsChange, isMobile = false }: SettingsPanelProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const copy = getCopy(settings.language)

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    onSettingsChange({ ...settings, [key]: value })
  }

  function close() { setOpen(false); triggerRef.current?.focus() }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close() }
      if (e.key === 'Tab') {
        const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        const first = buttons?.[0]
        const last = buttons?.[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open && panelRef.current) {
      const first = panelRef.current.querySelector<HTMLElement>('button, select, input')
      first?.focus()
    }
  }, [open])

  return (
    <div className="sp-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="sp-trigger"
        aria-label={copy.settingsTitle}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Settings size={17} />
      </button>

      {open && (
        <>
          <div
            className={isMobile ? 'sp-backdrop sp-backdrop--mobile' : 'sp-backdrop'}
            aria-hidden="true"
            onClick={close}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label={copy.settingsTitle}
            aria-modal="true"
            className={isMobile ? 'sp-panel sp-panel--mobile' : 'sp-panel'}
          >
            <div className="sp-title-row">
              <p className="sp-title">{copy.settingsTitle}</p>
              <button type="button" className="sp-close" aria-label={copy.close} onClick={close}>
                <X size={16} />
              </button>
            </div>

            <SegmentRow<AppSettings['theme']>
              label={copy.theme}
              icon={SunMoon}
              value={settings.theme}
              options={[
                { value: 'light', label: copy.lightTheme, icon: Sun },
                { value: 'dark', label: copy.darkTheme, icon: Moon },
              ]}
              onChange={(value) => set('theme', value)}
            />
            <SegmentRow<AppSettings['language']>
              label={copy.language}
              icon={Languages}
              value={settings.language}
              options={[
                { value: 'pt', label: 'PT' },
                { value: 'en', label: 'EN' },
              ]}
              onChange={(value) => set('language', value)}
            />
            <SegmentRow<AppSettings['windUnit']>
              label={copy.wind}
              icon={Wind}
              value={settings.windUnit}
              options={[
                { value: 'kmh', label: 'km/h' },
                { value: 'knots', label: 'kn' },
              ]}
              onChange={(value) => set('windUnit', value)}
            />
          </div>
        </>
      )}
    </div>
  )
}
