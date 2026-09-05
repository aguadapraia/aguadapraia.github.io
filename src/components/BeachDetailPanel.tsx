import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Language } from '../i18n'
import { beachSheetAfterDrag, beachSheetHeight, type BeachSheetLevel } from '../lib/beach-sheet'
import { formatCompactDate } from '../lib/relative-date'

interface BeachDetailPanelProps {
  name: string
  location: string
  date: string
  language: Language
  scrollRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}

export default function BeachDetailPanel({ name, location, date, language, scrollRef, children }: BeachDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; y: number; height: number } | null>(null)
  const ignoreClick = useRef(false)
  const previousLevel = useRef<BeachSheetLevel>('summary')
  const [level, setLevel] = useState<BeachSheetLevel>('summary')
  const [maximum, setMaximum] = useState(600)
  const [summaryHeight, setSummaryHeight] = useState(420)
  const [mobile, setMobile] = useState(false)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const id = useId()
  const pt = language === 'pt'
  const collapsed = mobile && level === 'collapsed'

  useLayoutEffect(() => {
    const stage = panelRef.current?.closest('.beach-map-layout')
    const header = stage?.querySelector('.beach-sidebar-header')
    const heading = headingRef.current
    const body = scrollRef.current
    const history = body?.querySelector('.beach-detail-history')
    if (!stage || !header || !heading || !body || !history) {
      console.warn('Beach detail panel could not find its layout containers')
      return
    }
    const media = window.matchMedia('(max-width: 760px) and ((min-height: 551px) or (max-width: 559px))')
    const resize = () => {
      setMobile(media.matches)
      setMaximum(Math.max(64, stage.getBoundingClientRect().bottom - header.getBoundingClientRect().bottom - 12))
      drag.current = null
      setDragHeight(null)
    }
    const measureContent = () => {
      const height = heading.getBoundingClientRect().height +
        history.getBoundingClientRect().bottom - body.getBoundingClientRect().top + body.scrollTop + 12
      setSummaryHeight(Math.ceil(height))
    }
    const observer = new ResizeObserver(() => { resize(); measureContent() })
    observer.observe(stage)
    observer.observe(header)
    const contentObserver = new ResizeObserver(measureContent)
    contentObserver.observe(heading)
    contentObserver.observe(history)
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
      ignoreClick.current = true
    }
    drag.current = null
    setDragHeight(null)
  }

  const style: CSSProperties = mobile ? { height: dragHeight ?? beachSheetHeight(level, maximum, summaryHeight) } : {}
  return (
    <div className="beach-detail-panel" ref={panelRef} style={style}
      data-collapsed={collapsed} data-dragging={dragHeight !== null} data-level={level}>
      <div className="beach-panel-header" ref={headingRef}
        onPointerDown={(event) => {
          if (!mobile || !event.isPrimary || event.button !== 0) return
          ignoreClick.current = false
          drag.current = { id: event.pointerId, y: event.clientY, height: panelRef.current?.getBoundingClientRect().height ?? 64 }
          if (event.target instanceof Element) event.target.setPointerCapture(event.pointerId)
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
          <span>{location}</span>
        </div>
        <button type="button" className="beach-sheet-handle" aria-expanded={!collapsed} aria-controls={id}
          title={collapsed ? (pt ? 'Expandir detalhes' : 'Expand details') : (pt ? 'Ver mapa' : 'View map')}
          aria-label={collapsed ? (pt ? `Expandir detalhes de ${name}` : `Expand details for ${name}`) : (pt ? 'Minimizar detalhes e ver mapa' : 'Minimize details and view map')}
          onClick={(event) => {
            if (ignoreClick.current && event.detail !== 0) { ignoreClick.current = false; return }
            ignoreClick.current = false
            if (level !== 'collapsed') previousLevel.current = level
            setLevel(level === 'collapsed' ? previousLevel.current : 'collapsed')
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
    </div>
  )
}
