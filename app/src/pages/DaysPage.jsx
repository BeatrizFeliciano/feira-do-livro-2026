import { useState, useMemo } from 'react'
import { ShelfBadge } from '../components/ShelfBadge'

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${d.toLocaleDateString('pt-PT', { month: 'long' })}`
}

function formatDateShort(raw) {
  const [, m, d] = raw.split('-')
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`
}

function BookRow({ book, onToggleWant, onToggleBought }) {
  return (
    <div className={`day-book-row ${book.bought ? 'day-book-row--bought' : ''}`}>
      <img
        className="day-book-row__cover"
        src={book.feira_cover_jpg}
        alt={book.gr_title}
        loading="lazy"
        onError={e => { e.target.style.visibility = 'hidden' }}
      />
      <div className="day-book-row__info">
        <span className="day-book-row__title">{book.gr_title}</span>
        <div className="day-book-row__meta">
          <ShelfBadge shelf={book.gr_shelf} />
          <span className="day-book-row__price">€{parseFloat(book.feira_pvp_livro_do_dia).toFixed(2)}</span>
          <span className="day-book-row__author">{book.gr_author}</span>
        </div>
      </div>
      <div className="day-book-row__actions">
        <button
          className={`btn-action btn-want btn-sm ${book.wantToBuy ? 'active' : ''}`}
          onClick={() => onToggleWant(book.id)}
          title={book.wantToBuy ? 'Remover' : 'Quero comprar'}
        >
          {book.wantToBuy ? '♥' : '♡'}
        </button>
        <button
          className={`btn-action btn-bought btn-sm ${book.bought ? 'active' : ''}`}
          onClick={() => onToggleBought(book.id)}
          title={book.bought ? 'Desmarcar' : 'Comprado'}
        >
          {book.bought ? '✓' : '○'}
        </button>
      </div>
    </div>
  )
}

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'want', label: 'Quero comprar' },
  { key: 'not-bought', label: 'Por comprar' },
]

function matches(book, query) {
  const q = query.toLowerCase()
  return book.gr_title.toLowerCase().includes(q) || book.gr_author.toLowerCase().includes(q)
}

export function DaysPage({ books, onToggleWant, onToggleBought }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [activeDay, setActiveDay] = useState(null)

  const visibleBooks = useMemo(
    () => query === '' ? books : books.filter(b => matches(b, query)),
    [books, query]
  )

  const allDates = useMemo(() => {
    const dates = new Set()
    books.forEach(b => b.discountDates.forEach(d => dates.add(d)))
    return [...dates].sort()
  }, [books])

  const wantCountByDate = useMemo(() => {
    const counts = {}
    allDates.forEach(d => {
      counts[d] = visibleBooks.filter(b => b.discountDates.includes(d) && b.wantToBuy).length
    })
    return counts
  }, [visibleBooks, allDates])

  const bestDayCount = Math.max(...Object.values(wantCountByDate), 0)

  const days = useMemo(() => {
    const datesToShow = activeDay ? [activeDay] : allDates
    return datesToShow.map(date => {
      let booksOnDay = visibleBooks.filter(b => b.discountDates.includes(date))

      if (filter === 'want') booksOnDay = booksOnDay.filter(b => b.wantToBuy)
      if (filter === 'not-bought') booksOnDay = booksOnDay.filter(b => b.wantToBuy && !b.bought)

      // group by stand
      const byStand = {}
      booksOnDay.forEach(b => {
        if (!byStand[b.feira_stand]) byStand[b.feira_stand] = []
        byStand[b.feira_stand].push(b)
      })

      return { date, booksOnDay, byStand }
    }).filter(d => d.booksOnDay.length > 0)
  }, [books, allDates, activeDay, filter, visibleBooks])

  return (
    <div className="page">
      <div className="days-controls-row">
        <select
          className="map-day-select"
          value={activeDay || ''}
          onChange={e => setActiveDay(e.target.value || null)}
        >
          <option value="">Todos os dias</option>
          {allDates.map(day => (
            <option key={day} value={day}>{formatDateShort(day)}</option>
          ))}
        </select>
        <input
          className="search-bar"
          type="search"
          placeholder="Pesquisar por título ou autor..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="day-filter-tabs">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`shelf-tab ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {days.length === 0 && (
        <p className="empty-state">Nenhum livro encontrado com este filtro.</p>
      )}

      {days.map(({ date, booksOnDay, byStand }) => {
        const wantCount = wantCountByDate[date]
        const isBest = bestDayCount > 0 && wantCount === bestDayCount

        return (
          <div key={date} className={`day-section ${isBest ? 'day-section--best' : ''}`}>
            <div className="day-section__header">
              <div className="day-section__title">
                {isBest && <span className="best-badge" title="Melhor dia para ir">★</span>}
                <span>{formatDate(date)}</span>
              </div>
              <div className="day-section__counts">
                <span className="count-badge">{booksOnDay.length} livro{booksOnDay.length !== 1 ? 's' : ''}</span>
                {wantCount > 0 && (
                  <span className="count-badge count-badge--want">♥ {wantCount}</span>
                )}
              </div>
            </div>

            {Object.entries(byStand).sort(([a], [b]) => a.localeCompare(b)).map(([stand, standBooks]) => (
              <div key={stand} className="stand-group">
                <div className="stand-group__header">
                  <span className="stand-code">{stand}</span>
                  <span className="stand-name">{standBooks[0].feira_participante}</span>
                </div>
                {standBooks.map(book => (
                  <BookRow
                    key={book.id}
                    book={book}
                    onToggleWant={onToggleWant}
                    onToggleBought={onToggleBought}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
