import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { getCopy, type Language } from '../i18n'
import { beachSheetAfterDrag, beachSheetHeight, type BeachSheetLevel } from '../lib/beach-sheet'
import { formatCompactDate } from '../lib/relative-date'
import { forecastForDate } from '../lib/beach-discovery'
import { formatDistance } from '../lib/units'
import type { BeachViewModel } from '../types'

interface BeachDetailPanelProps {
  beach: BeachViewModel
  date: string
  language: Language
  scrollRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}

export default function BeachDetailPanel({ beach, date, language, scrollRef, children }: BeachDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; y: number; height: number; toggle: boolean } | null>(null)
  const previousLevel = useRef<BeachSheetLevel>('summary')
  const [level, setLevel] = useState<BeachSheetLevel>('summary')
  const [maximum, setMaximum] = useState(600)
  const [summaryHeight, setSummaryHeight] = useState(420)
  const [mobile, setMobile] = useState(false)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const id = useId()
  const pt = language === 'pt'
  const copy = getCopy(language)
  const name = beach.name
  const forecast = forecastForDate(beach, date)
  const collapsed = mobile && level === 'collapsed'

  useLayoutEffect(() => {
    const stage = panelRef.current?.closest('.beach-map-layout')
    const header = stage?.querySelector('.beach-sidebar-header')
    const heading = headingRef.current
    const body = scrollRef.current
    const source = sourceRef.current
    const history = body?.querySelector('.beach-detail-history')
    if (!stage || !header || !heading || !body || !history || !source) {
      console.warn('Beach detail panel could not find its layout containers')
      return
    }
    const media = window.matchMedia('(max-width: 760px) and ((min-height: 551px) or (max-width: 559px))')
    const resize = () => {
      if (stage.getAttribute('data-suspended') === 'true' || stage.getBoundingClientRect().height < 1) return
      setMobile(media.matches)
      setMaximum(Math.max(64, stage.getBoundingClientRect().bottom - header.getBoundingClientRect().bottom - 12))
      drag.current = null
      setDragHeight(null)
    }
    const measureContent = () => {
      if (stage.getAttribute('data-suspended') === 'true' || stage.getBoundingClientRect().height < 1 || source.getBoundingClientRect().height < 1) return
      const height = heading.getBoundingClientRect().height + source.getBoundingClientRect().height +
        history.getBoundingClientRect().bottom - body.getBoundingClientRect().top + body.scrollTop + 12
      setSummaryHeight(Math.ceil(height))
    }
    const observer = new ResizeObserver(() => { resize(); measureContent() })
    observer.observe(stage)
    observer.observe(header)
    const contentObserver = new ResizeObserver(measureContent)
    contentObserver.observe(heading)
    contentObserver.observe(history)
    contentObserver.observe(source)
    if (body.firstElementChild) contentObserver.observe(body.firstElementChild)
    media.addEventListener('change', resize)
    resize()
    measureContent()
    return () => { observer.disconnect(); contentObserver.disconnect(); media.removeEventListener('change', resize) }
  }, [scrollRef])

  function finishDrag(event: PointerEvent<HTMLElement>, cancelled = false) {
    const start = drag.current
    if (!start || start.id !== event.pointerId) return
    const delta = start.y - event.clientY
    if (!cancelled && Math.abs(delta) >= 12) {
      const next = beachSheetAfterDrag(level, delta, maximum, summaryHeight)
      if (next === 'collapsed' && level !== 'collapsed') previousLevel.current = level
      setLevel(next)
    } else if (!cancelled && start.toggle) {
      togglePanel()
    }
    drag.current = null
    setDragHeight(null)
  }

  function togglePanel() {
    if (level !== 'collapsed') previousLevel.current = level
    setLevel(level === 'collapsed' ? previousLevel.current : 'collapsed')
  }

  const style: CSSProperties = mobile ? { height: dragHeight ?? beachSheetHeight(level, maximum, summaryHeight) } : {}
  return (
    <div className="beach-detail-panel" ref={panelRef} style={style}
      data-collapsed={collapsed} data-dragging={dragHeight !== null} data-level={level}>
      <div className="beach-panel-header" ref={headingRef}
        onPointerDown={(event) => {
          if (!mobile || !event.isPrimary || event.button !== 0) return
          const button = event.target instanceof Element ? event.target.closest('button') : null
          drag.current = { id: event.pointerId, y: event.clientY, height: panelRef.current?.getBoundingClientRect().height ?? 64, toggle: Boolean(button) }
          const captureTarget = button ?? event.currentTarget
          // Keep captured touch on the control rather than its nested SVG.
          captureTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (start?.id === event.pointerId) setDragHeight(Math.max(64, Math.min(maximum, start.height + start.y - event.clientY)))
        }}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onLostPointerCapture={(event) => finishDrag(event, true)}>
        <i className="beach-sheet-grip" aria-hidden="true" />
        <div className="beach-title">
          <div><h2 id="beach-detail-title" tabIndex={-1}>{name}</h2><small>{formatCompactDate(date, language)}</small></div>
          <span>{beach.municipality} · {beach.district}</span>
        </div>
        <button type="button" className="beach-sheet-handle" aria-expanded={!collapsed} aria-controls={id}
          title={collapsed ? (pt ? 'Expandir detalhes' : 'Expand details') : (pt ? 'Ver mapa' : 'View map')}
          aria-label={collapsed ? (pt ? `Expandir detalhes de ${name}` : `Expand details for ${name}`) : (pt ? 'Minimizar detalhes e ver mapa' : 'Minimize details and view map')}
          onClick={(event) => {
            // Pointer taps toggle on release; click covers keyboard and assistive input.
            if (event.detail === 0) togglePanel()
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              const next = beachSheetAfterDrag(level, event.key === 'ArrowUp' ? 30 : -30, maximum, summaryHeight)
              if (next === 'collapsed' && level !== 'collapsed') previousLevel.current = level
              setLevel(next)
            }
          }}>
          {collapsed ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        </button>
      </div>
      <div className="beach-sidebar-body" id={id} ref={scrollRef} inert={collapsed}>{children}</div>
      <div className="beach-data-note beach-panel-source" ref={sourceRef} inert={collapsed}>
        {forecast && <p>{pt ? 'Ar: previsão de' : 'Air: forecast for'} {forecast.airLocation} · {formatDistance(forecast.airDistanceKm)}</p>}
        <a target="_blank" rel="noreferrer noopener"
          href={`https://www.ipma.pt/pt/maritima/costeira/index.jsp?selLocal=${encodeURIComponent(beach.id)}&idLocal=${encodeURIComponent(beach.id)}`}>
          {pt ? 'Ver praia no IPMA.pt' : 'View beach on IPMA.pt'}<ExternalLink size={12} /><span className="sr-only">{copy.opensNewWindow}</span>
        </a>
      </div>
    </div>
  )
}
