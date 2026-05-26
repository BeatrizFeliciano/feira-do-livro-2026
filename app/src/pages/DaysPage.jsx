import { useState, useMemo } from 'react'
import { ShelfBadge } from '../components/ShelfBadge'
import { TrashIcon } from '../components/TrashIcon'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useLanguage } from '../LanguageContext'
import { makeT } from '../i18n'

function formatDate(dateStr, locale) {
  const d = new Date(dateStr + 'T00:00:00')
  const s = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDateShort(dateStr, locale) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

function BookRow({ book, onToggleWant, onToggleBought, onRemove }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  return (
    <div className={`day-book-row ${book.bought ? 'day-book-row--bought' : ''}`}>
      <img
        className="day-book-row__cover"
        src={book.feira_cover_jpg}
        alt={book.feira_titulo}
        loading="lazy"
        onError={e => { e.target.style.visibility = 'hidden' }}
      />
      <div className="day-book-row__info">
        <span className="day-book-row__title">{book.feira_titulo}</span>
        <div className="day-book-row__meta">
          <ShelfBadge shelf={book.gr_shelf} />
          <span className="day-book-row__price">€{parseFloat(book.feira_pvp_livro_do_dia).toFixed(2)}</span>
          <span className="day-book-row__author">{book.feira_autor}</span>
        </div>
      </div>
      <div className="day-book-row__actions">
        <button
          className={`btn-action btn-want btn-sm ${book.wantToBuy ? 'active' : ''}`}
          onClick={() => onToggleWant(book.id)}
          title={book.wantToBuy ? t('action_remove') : t('action_want')}
        >
          {book.wantToBuy ? '♥' : '♡'}
        </button>
        <button
          className={`btn-action btn-bought btn-sm ${book.bought ? 'active' : ''}`}
          onClick={() => onToggleBought(book.id)}
          title={book.bought ? t('action_unbought') : t('action_bought')}
        >
         {book.bought ? '✓' : '○'}
        </button>
        {onRemove && (
          <button
            className="btn-action btn-remove btn-sm"
            onClick={() => setConfirmingRemove(true)}
            title={t('action_remove_list')}
          >
            <TrashIcon />
          </button>
        )}
        {confirmingRemove && (
          <ConfirmDialog
            message={t('confirm_remove_book', book.feira_titulo)}
            onConfirm={() => onRemove(book.id)}
            onCancel={() => setConfirmingRemove(false)}
          />
        )}
      </div>
    </div>
  )
}

const FILTER_KEYS = [
  { key: 'all',        labelKey: 'days_all' },
  { key: 'not-bought', labelKey: 'days_not_bought' },
  { key: 'bought',     labelKey: 'days_bought' },
]

function matches(book, query) {
  const q = query.toLowerCase()
  return book.gr_title.toLowerCase().includes(q) || book.gr_author.toLowerCase().includes(q)
}

export function DaysPage({ books, onToggleWant, onToggleBought, onShowOnMap, onRemove }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
  const locale = t('date_locale')

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

      if (filter === 'not-bought') booksOnDay = booksOnDay.filter(b => b.wantToBuy && !b.bought)
      if (filter === 'bought')    booksOnDay = booksOnDay.filter(b => b.wantToBuy && b.bought)

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
          <option value="">{t('days_all_days')}</option>
          {allDates.map(day => (
            <option key={day} value={day}>{formatDateShort(day, locale)}</option>
          ))}
        </select>
        <input
          className="search-bar"
          type="search"
          placeholder={t('days_search_ph')}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="day-filter-tabs">
        {FILTER_KEYS.map(f => (
          <button
            key={f.key}
            className={`shelf-tab ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {days.length === 0 && (
        <p className="empty-state">{t('days_empty')}</p>
      )}

      {days.map(({ date, booksOnDay, byStand }) => {
        const wantCount = wantCountByDate[date]
        const isBest = bestDayCount > 0 && wantCount === bestDayCount

        return (
          <div key={date} className={`day-section ${isBest ? 'day-section--best' : ''}`}>
            <div className="day-section__header">
              <div className="day-section__title">
                {isBest && <span className="best-badge" title={t('books_best_day_title')}>★</span>}
                <span>{formatDate(date, locale)}</span>
              </div>
              <div className="day-section__counts">
                <span className="count-badge">{t('books_n_books', booksOnDay.length)}</span>
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
                  {onShowOnMap && (
                    <button
                      className="btn-pin"
                      onClick={() => onShowOnMap(stand)}
                      title={t('action_view_map', stand)}
                    >📍</button>
                  )}
                </div>
                {standBooks.map(book => (
                  <BookRow
                    key={book.id}
                    book={book}
                    onToggleWant={onToggleWant}
                    onToggleBought={onToggleBought}
                    onRemove={onRemove}
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
