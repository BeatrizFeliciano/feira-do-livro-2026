import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../LanguageContext'
import { makeT } from '../i18n'

const SVG_W = 1600
const SVG_H = 2400

function formatDate(raw, locale) {
  const d = new Date(raw + 'T00:00:00')
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })
}

function StandPopup({ stand, books, publishers, activeDay, locale, onToggleWant, onToggleBought, onClose }) {
  const { lang } = useLanguage()
  const t = makeT(lang)

  const standBooks = books.filter(b => {
    if (b.feira_stand !== stand) return false
    if (activeDay) return b.discountDates.includes(activeDay) || b.discountDates.length === 0
    return true
  })
  const allStandBooks = books.filter(b => b.feira_stand === stand)
  const publisherName = allStandBooks[0]?.feira_participante || publishers[stand] || null
  return (
    <div className="map-popup" onClick={e => e.stopPropagation()}>
      <div className="map-popup__header">
        <strong>Stand {stand}</strong>
        {publisherName && <span className="map-popup__publisher">{publisherName}</span>}
        <button className="map-popup__close" onClick={onClose}>✕</button>
      </div>
      {standBooks.length === 0 ? (
        <div className="map-popup__empty">
          {activeDay
            ? t('map_no_books_filtered', formatDate(activeDay, locale))
            : t('map_no_books')}
        </div>
      ) : (
        <ul className="map-popup__list">
          {standBooks.map(book => (
            <li key={book.id} className={`map-popup__book ${book.bought ? 'map-popup__book--bought' : ''}`}>
              <div className="map-popup__book-info">
                <span className="map-popup__book-title">{book.feira_titulo}</span>
                <span className="map-popup__book-author">{book.feira_autor}</span>
                <span className="map-popup__book-price">€{parseFloat(book.livroDodia ? book.feira_pvp_livro_do_dia : book.feira_pvp_feira).toFixed(2)}</span>
              </div>
              <div className="map-popup__book-actions">
                <button
                  className={`btn-action btn-sm btn-want ${book.wantToBuy ? 'active' : ''}`}
                  onClick={() => onToggleWant(book.id)}
                  title={book.wantToBuy ? t('action_remove_list') : t('map_want')}
                >{book.wantToBuy ? '♥' : '♡'}</button>
                <button
                  className={`btn-action btn-sm btn-bought ${book.bought ? 'active' : ''}`}
                  onClick={() => onToggleBought(book.id)}
                  title={book.bought ? t('action_unbought') : t('action_bought')}
                >✓</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MapPage({ books, onToggleWant, onToggleBought, openStand, onStandOpened }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
  const locale = t('date_locale')

  const [coords, setCoords] = useState(null)
  const [publishers, setPublishers] = useState({})
  const [query, setQuery] = useState('')
  const [activeDay, setActiveDay] = useState(null)
  const [markerFilter, setMarkerFilter] = useState(null) // null | 'want' | 'bought'
  const [selectedStand, setSelectedStand] = useState(null)
  // Fixed viewport pixel coordinates for the portal-rendered popup
  const [popupPos, setPopupPos] = useState({ top: 0, bottom: 'auto', left: 0 })
  const [imgLoaded, setImgLoaded] = useState(false)
  const containerRef = useRef(null)
  const imgRef = useRef(null)

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'stand-coordinates.json')
      .then(r => r.json()).then(setCoords).catch(console.error)
    fetch(import.meta.env.BASE_URL + 'stand-publishers.json')
      .then(r => r.json()).then(setPublishers).catch(console.error)
  }, [])

  // All unique discount dates, sorted chronologically
  const allDays = useMemo(() => {
    const set = new Set()
    books.forEach(b => b.discountDates.forEach(d => set.add(d)))
    return [...set].sort()  // ISO strings sort correctly as-is
  }, [books])

  // Stand → books lookup (respects active day filter)
  const booksByStand = useMemo(() => {
    const map = {}
    books.forEach(b => {
      if (!b.feira_stand) return
      if (activeDay && !b.discountDates.includes(activeDay) && b.discountDates.length > 0) return
      if (!map[b.feira_stand]) map[b.feira_stand] = []
      map[b.feira_stand].push(b)
    })
    return map
  }, [books, activeDay])

  // Stand colour classification (respects markerFilter)
  function standClass(code) {
    const standBooks  = booksByStand[code] || []
    if (standBooks.length === 0) return 'none'
    const hasBought   = standBooks.some(b => b.bought)
    const hasWantOnly = standBooks.some(b => b.wantToBuy && !b.bought)
    if (markerFilter === 'want')   return hasWantOnly ? 'want'   : 'none'
    if (markerFilter === 'bought') return hasBought   ? 'bought' : 'none'
    if (hasBought)   return 'bought'
    if (hasWantOnly) return 'want'
    return 'none'
  }

  // Multi-target search: stand code, publisher name, book title/author
  const highlightSet = useMemo(() => {
    const q = query.trim()
    if (!q || !coords) return new Set()
    const result = new Set()
    const qUp = q.toUpperCase()
    const qLow = q.toLowerCase()

    // Stand code: exact or prefix
    Object.keys(coords).forEach(code => {
      if (code.startsWith(qUp)) result.add(code)
    })

    // Publisher name
    if (q.length >= 2) {
      Object.entries(publishers).forEach(([code, name]) => {
        if (name.toLowerCase().includes(qLow)) result.add(code)
      })
    }

    // Book title or author
    if (q.length >= 2) {
      books.forEach(b => {
        if (!b.feira_stand) return
        if (b.feira_titulo.toLowerCase().includes(qLow) || b.gr_title.toLowerCase().includes(qLow) || b.feira_autor.toLowerCase().includes(qLow)) {
          result.add(b.feira_stand)
        }
      })
    }

    return result
  }, [query, coords, publishers, books])

  // Place the popup next to a given viewport anchor point.
  function placePopup(anchorX, anchorY) {
    const vw     = window.innerWidth
    const vh     = window.innerHeight
    const PW     = Math.min(280, vw - 16)
    const PH     = 320
    const GAP    = 12
    const MARGIN = 8

    const visibleArea = (l, tt) => {
      const visW = Math.max(0, Math.min(l + PW, vw - MARGIN) - Math.max(l, MARGIN))
      const visH = Math.max(0, Math.min(tt + PH, vh - MARGIN) - Math.max(tt, MARGIN))
      return visW * visH
    }

    const candidates = [
      { l: anchorX + GAP,       t: anchorY - PH / 2,    cssBottom: null,              freeY: true  },
      { l: anchorX - GAP - PW,  t: anchorY - PH / 2,    cssBottom: null,              freeY: true  },
      { l: anchorX - PW / 2,    t: anchorY - GAP - PH,  cssBottom: vh-(anchorY-GAP),  freeX: true  },
      { l: anchorX - PW / 2,    t: anchorY + GAP,        cssBottom: null,              freeX: true  },
    ]

    const best = candidates
      .map(c => {
        let { l, t: tt } = c
        if (c.freeY) tt = Math.max(MARGIN, Math.min(tt, vh - PH - MARGIN))
        if (c.freeX) l  = Math.max(MARGIN, Math.min(l,  vw - PW - MARGIN))
        return { l, t: tt, cssBottom: c.cssBottom, area: visibleArea(l, tt) }
      })
      .reduce((a, b) => b.area > a.area ? b : a)

    setPopupPos({ top: best.cssBottom != null ? 'auto' : best.t, bottom: best.cssBottom ?? 'auto', left: best.l })
  }

  // Open programmatically (pin button auto-open): scroll the marker into the
  // visible area first, then read its bounding rect.
  const openPopupForStand = useCallback((code) => {
    if (!coords || !coords[code]) return
    const markerEl = containerRef.current?.querySelector(`[data-stand="${code}"]`)
    if (markerEl) {
      markerEl.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
      requestAnimationFrame(() => {
        const r = markerEl.getBoundingClientRect()
        placePopup(r.left + r.width / 2, r.top + r.height / 2)
        setSelectedStand(code)
      })
    } else if (imgRef.current) {
      const pos   = coords[code]
      const iRect = imgRef.current.getBoundingClientRect()
      placePopup(
        iRect.left + (pos.x / SVG_W) * iRect.width,
        iRect.top  + (pos.y / SVG_H) * iRect.height,
      )
      setSelectedStand(code)
    }
  }, [coords])

  function handleMarkerClick(code, e) {
    e.stopPropagation()
    if (selectedStand === code) { setSelectedStand(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    placePopup(r.left + r.width / 2, r.top + r.height / 2)
    setSelectedStand(code)
  }

  useEffect(() => {
    if (!openStand || !coords || !imgLoaded) return
    openPopupForStand(openStand)
    onStandOpened?.()
  }, [openStand, coords, imgLoaded, openPopupForStand, onStandOpened])

  // Close popup on scroll/resize so the fixed position doesn't drift
  useEffect(() => {
    if (!selectedStand) return
    const close = () => setSelectedStand(null)
    window.addEventListener('resize', close)
    const vp = containerRef.current
    if (vp) vp.addEventListener('scroll', close)
    return () => {
      window.removeEventListener('resize', close)
      if (vp) vp.removeEventListener('scroll', close)
    }
  }, [selectedStand])

  const standsWithBooks = Object.keys(booksByStand)

  const popupPortal = selectedStand && coords && createPortal(
    <div
      className="map-popup-anchor"
      style={{ position: 'fixed', top: popupPos.top, bottom: popupPos.bottom, left: popupPos.left, zIndex: 9999 }}
    >
      <StandPopup
        stand={selectedStand}
        books={books}
        publishers={publishers}
        activeDay={activeDay}
        locale={locale}
        onToggleWant={onToggleWant}
        onToggleBought={onToggleBought}
        onClose={() => setSelectedStand(null)}
      />
    </div>,
    document.body
  )

  return (
    <div className="map-page">
      <div className="map-controls">
        <div className="map-controls__row">
          <input
            className="search-bar"
            type="search"
            placeholder={t('map_search_ph')}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedStand(null) }}
          />
          <select
            className="map-day-select"
            value={activeDay || ''}
            onChange={e => { setActiveDay(e.target.value || null); setSelectedStand(null) }}
          >
            <option value="">{t('map_all_days')}</option>
            {allDays.map(day => (
              <option key={day} value={day}>{formatDate(day, locale)}</option>
            ))}
          </select>
        </div>
        <div className="map-legend">
          <button
            className={`legend-item legend-item--want ${markerFilter === 'want' ? 'legend-item--active' : ''}`}
            onClick={() => setMarkerFilter(f => f === 'want' ? null : 'want')}
          >{t('map_want')}</button>
          <button
            className={`legend-item legend-item--bought ${markerFilter === 'bought' ? 'legend-item--active' : ''}`}
            onClick={() => setMarkerFilter(f => f === 'bought' ? null : 'bought')}
          >{t('map_bought')}</button>
        </div>
      </div>

      <div
        className="map-viewport"
        ref={containerRef}
        onClick={() => setSelectedStand(null)}
      >
        <div className="map-inner">
          <img
            ref={imgRef}
            src={import.meta.env.BASE_URL + 'mapa2026.svg'}
            alt="Mapa Feira do Livro"
            className="map-svg-img"
            onLoad={() => setImgLoaded(true)}
          />

          {coords && (
            <div className="map-overlay">
              {Object.entries(coords).map(([code, pos]) => {
                const cls = standClass(code)
                const isHighlighted = highlightSet.has(code)
                const isSelected = selectedStand === code
                const hasBooks = standsWithBooks.includes(code)
                const searchActive = highlightSet.size > 0
                const effectiveCls = searchActive && !isHighlighted && !isSelected ? 'none' : cls
                const effectiveHasBooks = searchActive && !isHighlighted && !isSelected ? false : hasBooks
                return (
                  <button
                    key={code}
                    data-stand={code}
                    className={[
                      'map-marker',
                      effectiveCls !== 'none' ? `map-marker--${effectiveCls}` : '',
                      isHighlighted ? 'map-marker--highlight' : '',
                      isSelected ? 'map-marker--selected' : '',
                      !effectiveHasBooks && !isHighlighted ? 'map-marker--empty' : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      left: `${(pos.x / SVG_W) * 100}%`,
                      top: `${(pos.y / SVG_H) * 100}%`,
                    }}
                    onClick={e => handleMarkerClick(code, e)}
                    title={publishers[code] ? `${code} · ${publishers[code]}` : code}
                  >
                    {(isHighlighted || cls !== 'none' || isSelected) ? code : ''}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {popupPortal}
    </div>
  )
}
