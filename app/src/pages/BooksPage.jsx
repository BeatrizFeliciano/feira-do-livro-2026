import { useState, useMemo, useEffect } from 'react'
import { BookCard } from '../components/BookCard'
import { ShelfBadge } from '../components/ShelfBadge'
import { useLanguage } from '../LanguageContext'
import { makeT } from '../i18n'

const PAGE_SIZE = 50

const STATUS_FILTER_KEYS = [
  { key: 'all',        labelKey: 'books_filter_all' },
  { key: 'ldd',        labelKey: 'books_filter_ldd' },
  { key: 'not-bought', labelKey: 'books_filter_not_bought' },
  { key: 'bought',     labelKey: 'books_filter_bought' },
]

function formatDate(dateStr, locale) {
  const d = new Date(dateStr + 'T00:00:00')
  const s = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDateShort(dateStr, locale) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

function PriceBlock({ pvp, pvpFeira, pvpDia }) {
  const hasDia = pvpDia != null && pvpDia !== ''
  const savings = hasDia
    ? Math.round((1 - parseFloat(pvpDia) / parseFloat(pvp)) * 100)
    : 0
  return (
    <div className="price-block">
      <span className="price-original">€{parseFloat(pvp).toFixed(2)}</span>
      <span className="price-arrow">→</span>
      {hasDia ? (
        <>
          <span className="price-feira">€{parseFloat(pvpFeira).toFixed(2)}</span>
          <span className="price-arrow">→</span>
          <span className="price-dia">€{parseFloat(pvpDia).toFixed(2)}</span>
          {savings > 0 && <span className="price-savings">-{savings}%</span>}
        </>
      ) : (
        <span className="price-dia">€{parseFloat(pvpFeira).toFixed(2)}</span>
      )}
    </div>
  )
}

// ── Book row used in the day-grouped view ─────────────────
function BookRow({ book, onToggleWant, onToggleBought, onShowOnMap }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
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
          <span className="day-book-row__author">{book.feira_autor}</span>
        </div>
        <PriceBlock
          pvp={book.feira_pvp}
          pvpFeira={book.feira_pvp_feira}
          pvpDia={book.feira_pvp_livro_do_dia}
        />
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
      </div>
    </div>
  )
}

function groupByStand(books) {
  const byStand = {}
  for (const b of books) {
    if (!byStand[b.feira_stand]) byStand[b.feira_stand] = []
    byStand[b.feira_stand].push(b)
  }
  return byStand
}

function matches(book, query) {
  const q = query.toLowerCase()
  return (
    book.feira_titulo.toLowerCase().includes(q) ||
    book.gr_title.toLowerCase().includes(q) ||
    book.feira_autor.toLowerCase().includes(q) ||
    book.gr_author.toLowerCase().includes(q) ||
    (book.feira_participante || '').toLowerCase().includes(q) ||
    (book.feira_stand || '').toLowerCase().includes(q)
  )
}

// ── Main component ────────────────────────────────────────

export function BooksPage({ books, loading, loadingMessage, error, onToggleWant, onToggleBought, onShowOnMap, onNavigateToCatalog }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
  const locale = t('date_locale')

  const [status, setStatus]                   = useState('all')
  const [query, setQuery]                     = useState('')
  const [page, setPage]                       = useState(1)
  const [viewMode, setViewMode]               = useState('list')  // 'list' | 'days'
  const [activeDay, setActiveDay]             = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())

  // Books after status + search filter
  const filtered = useMemo(() =>
    books
      .filter(b => {
        if (status === 'ldd')        return b.livroDodia
        if (status === 'not-bought') return b.wantToBuy && !b.bought
        if (status === 'bought')     return b.wantToBuy && b.bought
        return true
      })
      .filter(b => query === '' || matches(b, query))
      .sort((a, b) => a.gr_title.localeCompare(b.gr_title, 'pt')),
    [books, status, query]
  )

  // All unique discount dates that appear in filtered books
  const allDates = useMemo(() => {
    const dates = new Set()
    filtered.forEach(b => b.discountDates.forEach(d => dates.add(d)))
    return [...dates].sort()
  }, [filtered])

  // Count of wanted books per date (for best-day badge)
  const wantCountByDate = useMemo(() => {
    const counts = {}
    allDates.forEach(d => {
      counts[d] = filtered.filter(b => b.discountDates.includes(d) && b.wantToBuy).length
    })
    return counts
  }, [filtered, allDates])

  const bestDayCount = Math.max(...Object.values(wantCountByDate), 0)

  // Day sections for the grouped view
  const daySections = useMemo(() => {
    const datesToShow = activeDay ? [activeDay] : allDates
    return datesToShow.map(date => {
      const booksOnDay = filtered.filter(b => b.discountDates.includes(date))
      return { date, booksOnDay, byStand: groupByStand(booksOnDay) }
    }).filter(d => d.booksOnDay.length > 0)
  }, [filtered, allDates, activeDay])

  // Books with no discount dates → "Sem data" section (always shown)
  const noDatBooks = useMemo(() =>
    filtered.filter(b => b.discountDates.length === 0),
    [filtered, activeDay]
  )
  const noDatByStand = useMemo(() => groupByStand(noDatBooks), [noDatBooks])

  // Books used for pill counts — respects active day filter when in days view
  const booksForCount = useMemo(() => {
    if (viewMode !== 'days' || !activeDay) return books
    return books.filter(b => b.discountDates.includes(activeDay) || b.discountDates.length === 0)
  }, [books, viewMode, activeDay])

  // List-view pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleGroup(key) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [status, query])
  // Reset active day when switching away from days view
  useEffect(() => { if (viewMode !== 'days') setActiveDay(null) }, [viewMode])
  // Reset collapsed groups when filters or view mode change.
  // "Sem data" starts collapsed in all-days mode, expanded when explicitly selected.
  useEffect(() => {
    setCollapsedGroups(new Set())
  }, [status, query, activeDay, viewMode])
  // Scroll to top on page change
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [page])

  // Summary bar values
  const wantedBooks  = books.filter(b => b.wantToBuy && !b.bought)
  const boughtBooks  = books.filter(b => b.bought)
  const allListBooks = [...wantedBooks, ...boughtBooks]

  const price = b => parseFloat(b.livroDodia ? b.feira_pvp_livro_do_dia : b.feira_pvp_feira)
  const saving = b => parseFloat(b.feira_pvp) - price(b)

  const totalCost       = wantedBooks.reduce((sum, b) => sum + price(b), 0)
  const pendingSavings  = wantedBooks.reduce((sum, b) => sum + saving(b), 0)
  const boughtCost      = boughtBooks.reduce((sum, b) => sum + price(b), 0)
  const boughtSavings   = boughtBooks.reduce((sum, b) => sum + saving(b), 0)

  // Early returns — after all hooks
  if (loading && books.length === 0) return (
    <div className="loading">
      <div className="loading-spinner" />
      <p className="loading-detail">{loadingMessage || t('loading_books')}</p>
    </div>
  )
  if (error && books.length === 0) return (
    <div className="loading">
      <span className="loading-error">{t(error)}</span>
    </div>
  )
  if (!loading && books.length === 0) return (
    <div className="empty-books">
      <p className="empty-books__msg">{t('books_empty_msg')}</p>
      <p className="empty-books__hint">{t('books_empty_hint')}</p>
      {onNavigateToCatalog && (
        <button className="empty-books__btn" onClick={onNavigateToCatalog}>
          {t('books_empty_btn')}
        </button>
      )}
    </div>
  )

  return (
    <div className="page">
      {loading && (
        <div className="loading-banner">
          <div className="loading-spinner loading-spinner--sm" />
          <span>{loadingMessage || t('loading_books')}</span>
        </div>
      )}
      {error && !loading && (
        <div className="loading-banner loading-banner--error">
          <span>{t(error)}</span>
        </div>
      )}

      {allListBooks.length > 0 && (
        <div className="summary-bar">
          {wantedBooks.length > 0 && (
            <span className="summary-bar__pending">
              <strong>{wantedBooks.length}</strong> {t('books_summary_to_buy')} · <strong>€{totalCost.toFixed(2)}</strong> · {t('books_summary_savings')} <strong>€{pendingSavings.toFixed(2)}</strong>
            </span>
          )}
          {boughtBooks.length > 0 && (
            <span className="summary-bar__bought">
              {t('books_summary_bought_n', boughtBooks.length)} · <strong>€{boughtCost.toFixed(2)}</strong> · {t('books_summary_saved')} <strong>€{boughtSavings.toFixed(2)}</strong>
            </span>
          )}
        </div>
      )}

      {/* Row 1: search bar + view toggle */}
      <div className="books-top-row">
        <input
          className="search-bar search-bar--inline"
          type="search"
          placeholder={t('books_search_ph')}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="view-toggle">
          <button
            className={`view-toggle__btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >{t('books_view_list')}</button>
          <button
            className={`view-toggle__btn ${viewMode === 'days' ? 'active' : ''}`}
            onClick={() => setViewMode('days')}
          >{t('books_view_days')}</button>
        </div>
      </div>

      {/* Row 2: status filters + day selector */}
      <div className="books-filter-row">
        <div className="shelf-tabs">
          {STATUS_FILTER_KEYS.map(s => {
            const count =
              s.key === 'all'          ? booksForCount.length
              : s.key === 'ldd'        ? booksForCount.filter(b => b.livroDodia).length
              : s.key === 'not-bought' ? booksForCount.filter(b => b.wantToBuy && !b.bought).length
              : booksForCount.filter(b => b.wantToBuy && b.bought).length
            return (
              <button
                key={s.key}
                className={`shelf-tab ${status === s.key ? 'active' : ''}`}
                onClick={() => setStatus(s.key)}
              >
                {t(s.labelKey)} <span className="shelf-tab__count">{count}</span>
              </button>
            )
          })}
        </div>
        {viewMode === 'days' && (
          <select
            className="map-day-select map-day-select--inline"
            value={activeDay || ''}
            onChange={e => setActiveDay(e.target.value || null)}
          >
            <option value="">{t('books_all_days')}</option>
            {allDates.map(day => (
              <option key={day} value={day}>{formatDateShort(day, locale)}</option>
            ))}
            <option value="no-date">{t('books_no_date')}</option>
          </select>
        )}
      </div>

      {/* ── List view ──────────────────────────────────────── */}
      {viewMode === 'list' && (
        <>
          {filtered.length === 0 && (
            <p className="empty-state">{t('books_empty_filtered')}</p>
          )}
          <div className="book-list">
            {pageItems.map(book => (
              <BookCard
                key={book.id}
                book={book}
                onToggleWant={onToggleWant}
                onToggleBought={onToggleBought}
                onShowOnMap={onShowOnMap}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button className="pagination__btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                {t('books_pagination_prev')}
              </button>
              <span className="pagination__info">
                {page.toLocaleString(locale)} / {totalPages.toLocaleString(locale)}
              </span>
              <button className="pagination__btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                {t('books_pagination_next')}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Day-grouped view ───────────────────────────────── */}
      {viewMode === 'days' && (
        <>
          {daySections.length === 0 && !((activeDay === null || activeDay === 'no-date') && noDatBooks.length > 0) && (
            <p className="empty-state">{t('books_empty_filtered')}</p>
          )}

          {daySections.map(({ date, booksOnDay, byStand }) => {
            const wantCount = wantCountByDate[date]
            const isBest = bestDayCount > 0 && wantCount === bestDayCount
            const isCollapsed = collapsedGroups.has(date)
            return (
              <div key={date} className={`day-section ${isBest ? 'day-section--best' : ''}`}>
                <div
                  className="day-section__header"
                  onClick={() => toggleGroup(date)}
                  role="button"
                  aria-expanded={!isCollapsed}
                >
                  <div className="day-section__title">
                    {isBest && <span className="best-badge" title={t('books_best_day_title')}>★</span>}
                    <span>{formatDate(date, locale)}</span>
                  </div>
                  <div className="day-section__counts">
                    <span className="count-badge">{t('books_n_books', booksOnDay.length)}</span>
                    {wantCount > 0 && <span className="count-badge count-badge--want">♥ {wantCount}</span>}
                    <span className={`day-section__chevron${isCollapsed ? ' day-section__chevron--collapsed' : ''}`}>▼</span>
                  </div>
                </div>
                {!isCollapsed && Object.entries(byStand).sort(([a], [b]) => a.localeCompare(b)).map(([stand, standBooks]) => (
                  <div key={stand} className="stand-group">
                    <div className="stand-group__header">
                      <span className="stand-code">{stand}</span>
                      <span className="stand-name">{standBooks[0].feira_participante}</span>
                      {onShowOnMap && (
                        <button className="btn-pin" onClick={() => onShowOnMap(stand)} title={t('action_view_map', stand)}>📍</button>
                      )}
                    </div>
                    {standBooks.map(book => (
                      <BookRow
                        key={book.id}
                        book={book}
                        onToggleWant={onToggleWant}
                        onToggleBought={onToggleBought}
                        onShowOnMap={onShowOnMap}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )
          })}

          {/* "Sem data" section — visible in all-days mode (collapsed) and when explicitly selected */}
          {(activeDay === null || activeDay === 'no-date') && noDatBooks.length > 0 && (() => {
            const isCollapsed = collapsedGroups.has('no-date')
            return (
              <div className="day-section day-section--no-date">
                <div
                  className="day-section__header"
                  onClick={() => toggleGroup('no-date')}
                  role="button"
                  aria-expanded={!isCollapsed}
                >
                  <div className="day-section__title">
                    <span>{t('books_no_date')}</span>
                  </div>
                  <div className="day-section__counts">
                    <span className="count-badge">{t('books_n_books', noDatBooks.length)}</span>
                    <span className={`day-section__chevron${isCollapsed ? ' day-section__chevron--collapsed' : ''}`}>▼</span>
                  </div>
                </div>
                {!isCollapsed && Object.entries(noDatByStand).sort(([a], [b]) => a.localeCompare(b)).map(([stand, standBooks]) => (
                  <div key={stand} className="stand-group">
                    <div className="stand-group__header">
                      <span className="stand-code">{stand}</span>
                      <span className="stand-name">{standBooks[0].feira_participante}</span>
                      {onShowOnMap && (
                        <button className="btn-pin" onClick={() => onShowOnMap(stand)} title={t('action_view_map', stand)}>📍</button>
                      )}
                    </div>
                    {standBooks.map(book => (
                      <BookRow
                        key={book.id}
                        book={book}
                        onToggleWant={onToggleWant}
                        onToggleBought={onToggleBought}
                        onShowOnMap={onShowOnMap}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
