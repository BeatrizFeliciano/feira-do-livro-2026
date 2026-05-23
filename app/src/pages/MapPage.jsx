import { useState, useEffect, useRef, useMemo } from 'react'

const SVG_W = 1600
const SVG_H = 2400

function formatDate(raw) {
  // raw is "YYYY-MM-DD"
  const [, m, d] = raw.split('-')
  const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`
}

function StandPopup({ stand, books, publishers, activeDay, onToggleWant, onToggleBought, onClose }) {
  const standBooks = books.filter(b => {
    if (b.feira_stand !== stand) return false
    if (activeDay) return b.discountDates.includes(activeDay)
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
            ? `Sem livros da tua lista com desconto a ${formatDate(activeDay)}.`
            : 'Nenhum livro da tua lista aqui.'}
        </div>
      ) : (
        <ul className="map-popup__list">
          {standBooks.map(book => (
            <li key={book.id} className={`map-popup__book ${book.bought ? 'map-popup__book--bought' : ''}`}>
              <div className="map-popup__book-info">
                <span className="map-popup__book-title">{book.gr_title}</span>
                <span className="map-popup__book-author">{book.gr_author}</span>
                <span className="map-popup__book-price">€{parseFloat(book.feira_pvp_livro_do_dia).toFixed(2)}</span>
              </div>
              <div className="map-popup__book-actions">
                <button
                  className={`btn-action btn-sm btn-want ${book.wantToBuy ? 'active' : ''}`}
                  onClick={() => onToggleWant(book.id)}
                  title={book.wantToBuy ? 'Remover da lista' : 'Quero comprar'}
                >♡</button>
                <button
                  className={`btn-action btn-sm btn-bought ${book.bought ? 'active' : ''}`}
                  onClick={() => onToggleBought(book.id)}
                  title={book.bought ? 'Marcar como não comprado' : 'Marcar como comprado'}
                >✓</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MapPage({ books, onToggleWant, onToggleBought }) {
  const [coords, setCoords] = useState(null)
  const [publishers, setPublishers] = useState({})
  const [query, setQuery] = useState('')
  const [activeDay, setActiveDay] = useState(null)
  const [selectedStand, setSelectedStand] = useState(null)
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 })
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
      if (activeDay && !b.discountDates.includes(activeDay)) return
      if (!map[b.feira_stand]) map[b.feira_stand] = []
      map[b.feira_stand].push(b)
    })
    return map
  }, [books, activeDay])

  // Stand colour classification
  function standClass(code) {
    const standBooks = booksByStand[code] || []
    if (standBooks.length === 0) return 'none'
    if (standBooks.some(b => b.bought)) return 'bought'
    if (standBooks.some(b => b.wantToBuy)) return 'want'
    return 'list'
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
        if (b.gr_title.toLowerCase().includes(qLow) || b.gr_author.toLowerCase().includes(qLow)) {
          result.add(b.feira_stand)
        }
      })
    }

    return result
  }, [query, coords, publishers, books])

  function handleMarkerClick(code, e) {
    e.stopPropagation()
    if (selectedStand === code) { setSelectedStand(null); return }
    const img = imgRef.current
    if (!img || !coords) return
    const iRect = img.getBoundingClientRect()
    const pos = coords[code]
    // Popup anchor is inside .map-inner (position: relative), so coordinates
    // are relative to the image's own top-left — no container offset needed.
    const px = (pos.x / SVG_W) * iRect.width
    const py = (pos.y / SVG_H) * iRect.height
    // Quadrant-based placement to avoid going off-screen
    const openLeft = pos.x / SVG_W > 0.55
    const openDown = pos.y / SVG_H > 0.55
    setPopupPos({ top: py, left: px, openLeft, openDown })
    setSelectedStand(code)
  }

  const standsWithBooks = Object.keys(booksByStand)

  return (
    <div className="map-page">
      <div className="map-controls">
        <div className="map-controls__row">
          <select
            className="map-day-select"
            value={activeDay || ''}
            onChange={e => { setActiveDay(e.target.value || null); setSelectedStand(null) }}
          >
            <option value="">Todos os dias</option>
            {allDays.map(day => (
              <option key={day} value={day}>{formatDate(day)}</option>
            ))}
          </select>
          <input
            className="search-bar"
            type="search"
            placeholder="Pesquisar por stand, editora, ou livro..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedStand(null) }}
          />
        </div>
        <div className="map-legend">
          <span className="legend-item legend-item--want">Quero comprar</span>
          <span className="legend-item legend-item--list">Na lista</span>
          <span className="legend-item legend-item--bought">Comprado</span>
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
          />

          {coords && (
            <div className="map-overlay">
              {Object.entries(coords).map(([code, pos]) => {
                const cls = standClass(code)
                const isHighlighted = highlightSet.has(code)
                const isSelected = selectedStand === code
                const hasBooks = standsWithBooks.includes(code)
                return (
                  <button
                    key={code}
                    className={[
                      'map-marker',
                      cls !== 'none' ? `map-marker--${cls}` : '',
                      isHighlighted ? 'map-marker--highlight' : '',
                      isSelected ? 'map-marker--selected' : '',
                      !hasBooks && !isHighlighted ? 'map-marker--empty' : '',
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

          {selectedStand && coords && (
            <div
              className={[
                'map-popup-anchor',
                popupPos.openLeft ? 'map-popup-anchor--open-left' : '',
                popupPos.openDown ? 'map-popup-anchor--open-down' : '',
              ].filter(Boolean).join(' ')}
              style={{ top: popupPos.top, left: popupPos.left }}
            >
              <StandPopup
                stand={selectedStand}
                books={books}
                publishers={publishers}
                activeDay={activeDay}
                onToggleWant={onToggleWant}
                onToggleBought={onToggleBought}
                onClose={() => setSelectedStand(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
