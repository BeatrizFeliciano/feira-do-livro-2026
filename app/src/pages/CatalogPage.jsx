import { useState, useEffect, useMemo, useRef } from 'react'
import { WORKER_URL } from '../constants'
import { useLanguage } from '../LanguageContext'
import { makeT } from '../i18n'

const LIMIT = 50
const PAGE_SIZE = 50  // per-section infinite scroll page size
const TOTAL_ALL_BOOKS = 45234
const TOTAL_LDD_BOOKS = 5809

const normaliseIsbn = isbn => (isbn || '').replace(/\D/g, '')
const fmtCount = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

// Maps GR shelf key → i18n key
const GR_SHELF_I18N = {
  'to-read':           'gr_to_read',
  'currently-reading': 'gr_reading',
  'read':              'gr_read',
  'did-not-finish':    'gr_dnf',
}
const GR_SHELF_ORDER = ['to-read', 'currently-reading', 'read', 'did-not-finish']

function formatDate(dateStr, locale) {
  const d = new Date(dateStr + 'T00:00:00')
  const s = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDateShort(dateStr, locale) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

function groupByStand(books) {
  const byStand = {}
  for (const b of books) {
    const key = b.stand || '?'
    if (!byStand[key]) byStand[key] = []
    byStand[key].push(b)
  }
  return byStand
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function CatalogCard({ book, inList, grShelfLabel, onAdd, onRemove }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
  const [imgError, setImgError] = useState(false)
  const cover = book.cover_jpg || book.cover_webp

  return (
    <div className="catalog-card">
      {cover && !imgError ? (
        <img
          className="catalog-card__cover"
          src={cover}
          alt={book.titulo}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="catalog-card__cover" aria-hidden="true" />
      )}
      <div className="catalog-card__body">
        <div className="catalog-card__title-row">
          <span className="catalog-card__title">{book.titulo}</span>
          {grShelfLabel && (
            <span className="catalog-badge catalog-badge--gr-shelf">{grShelfLabel}</span>
          )}
        </div>
        <span className="catalog-card__author">{book.autor}</span>
        <span className="catalog-card__meta">{book.stand} · {book.participante_name}</span>
        <div className="catalog-card__price">
          <span className="price-original">€{parseFloat(book.pvp).toFixed(2)}</span>
          <span className="price-arrow">→</span>
          {book.pvp_livro_do_dia ? (
            <>
              <span className="price-feira">€{parseFloat(book.pvp_feira).toFixed(2)}</span>
              <span className="price-arrow">→</span>
              <span className="price-dia">€{parseFloat(book.pvp_livro_do_dia).toFixed(2)}</span>
            </>
          ) : (
            <span className="price-dia">€{parseFloat(book.pvp_feira).toFixed(2)}</span>
          )}
        </div>
      </div>
      <div className="catalog-card__action">
        <button
          className={`btn-action btn-want ${inList ? 'active' : ''}`}
          onClick={inList ? onRemove : onAdd}
          title={inList ? t('action_remove_list') : t('action_want')}
        >
          {inList ? t('catalog_want') : t('catalog_want_not')}
        </button>
      </div>
    </div>
  )
}

// ── Per-date section with its own independent infinite scroll ─────────────────
// Each section manages its own visible window. The observer is only active when
// the section is expanded, so collapsing sections has zero performance cost.
function DaySection({ label, books, collapsed, onToggle, renderCard, isNoDate, t }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  // Reset visible count whenever the books list changes identity (filter/query changed)
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [books])

  // Per-section infinite scroll — only active when expanded and more books remain
  useEffect(() => {
    if (collapsed || visibleCount >= books.length) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount(c => Math.min(c + PAGE_SIZE, books.length))
      },
      { rootMargin: '300px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [collapsed, visibleCount, books.length])

  const visibleBooks = books.slice(0, visibleCount)
  const byStand = groupByStand(visibleBooks)

  return (
    <div className={`day-section${isNoDate ? ' day-section--no-date' : ''}`}>
      <div
        className="day-section__header"
        onClick={onToggle}
        role="button"
        aria-expanded={!collapsed}
      >
        <div className="day-section__title"><span>{label}</span></div>
        <div className="day-section__counts">
          <span className="count-badge">{t('books_n_books', books.length)}</span>
          <span className={`day-section__chevron${collapsed ? ' day-section__chevron--collapsed' : ''}`}>▼</span>
        </div>
      </div>
      {!collapsed && (
        <>
          {Object.entries(byStand).sort(([a], [b]) => a.localeCompare(b)).map(([stand, standBooks]) => (
            <div key={stand} className="stand-group">
              <div className="stand-group__header">
                <span className="stand-code">{stand}</span>
                <span className="stand-name">{standBooks[0].participante_name || ''}</span>
              </div>
              <div className="book-list">{standBooks.map(renderCard)}</div>
            </div>
          ))}
          {visibleCount < books.length && (
            <div ref={sentinelRef} className="catalog-sentinel">
              <p className="catalog-count">{t('catalog_loading_more')}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function CatalogPage({ manualBooks, books, grBooks, faireBooks, faireLoading, needsOnboarding, onAdd, onRemove, onConnectGoodreads, onLoadFaireBooks }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
  const locale = t('date_locale')

  const [inputVal, setInputVal]           = useState('')
  const [catalogFilter, setCatalogFilter] = useState('all')   // 'all' | 'ldd'
  const [grFilter, setGrFilter]           = useState(null)    // null | 'goodreads-all' | shelf key

  const [viewMode, setViewMode]           = useState('list')  // 'list' | 'days'
  const [activeDay, setActiveDay]         = useState(null)
  // "Sem data" starts collapsed in all-days mode; reset effect keeps this in sync
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set(['no-date']))
  const [offset, setOffset]               = useState(0)
  const [results, setResults]             = useState([])
  const [hasMore, setHasMore]             = useState(true)
  const [fetching, setFetching]           = useState(false)
  const [fetchError, setFetchError]       = useState(null)
  const query       = useDebounce(inputVal, 300)
  const sentinelRef    = useRef(null)
  const fetchingRef    = useRef(false)

  function toggleGroup(key) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const isApiMode = grFilter === null   // no GR filter → fetch from API
  const isGrMode  = !isApiMode

  // Local search mode: when all_feira_books.json is loaded AND there's a query in
  // API mode, search client-side so publisher names (participante) are searchable.
  const isLocalSearchMode = !!faireBooks && !!query.trim() && isApiMode

  // All local results for the current query (no catalogFilter — used for pill counts)
  const localSearchBase = useMemo(() => {
    if (!isLocalSearchMode) return []
    const q = query.toLowerCase()
    return Object.entries(faireBooks)
      .filter(([, b]) =>
        (b.titulo       || '').toLowerCase().includes(q) ||
        (b.autor        || '').toLowerCase().includes(q) ||
        (b.participante || '').toLowerCase().includes(q)
      )
      .map(([isbn, b]) => ({
        isbn,
        titulo:            b.titulo,
        autor:             b.autor,
        participante_name: b.participante,
        stand:             b.stand,
        pvp:               b.pvp,
        pvp_feira:         b.pvp_feira,
        pvp_livro_do_dia:  b.pvp_livro_do_dia || null,
        livro_do_dia_datas: b.datas || [],
        cover_jpg:         b.cover || '',
      }))
      .sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'pt'))
  }, [isLocalSearchMode, faireBooks, query])

  // Local results after applying catalogFilter (what actually gets rendered)
  const localSearchResults = useMemo(() => {
    if (!isLocalSearchMode) return []
    return catalogFilter === 'ldd'
      ? localSearchBase.filter(b => Boolean(b.pvp_livro_do_dia))
      : localSearchBase
  }, [isLocalSearchMode, localSearchBase, catalogFilter])

  // ISBN → gr_shelf for all GR-matched books
  const grIsbnToShelf = useMemo(() => {
    const map = new Map()
    for (const b of grBooks) map.set(b.id, b.gr_shelf)
    return map
  }, [grBooks])

  // GR books grouped by shelf (normalised to CatalogCard format)
  const grBooksByShelf = useMemo(() => {
    const byShelf = {}
    for (const b of grBooks) {
      const shelf = b.gr_shelf
      if (!shelf) continue
      if (!byShelf[shelf]) byShelf[shelf] = []
      byShelf[shelf].push({
        isbn:             b.id,
        gr_title:         b.gr_title,
        titulo:           b.feira_titulo,
        autor:            b.feira_autor,
        stand:            b.feira_stand,
        participante_name: b.feira_participante,
        pvp:              b.feira_pvp,
        pvp_feira:        b.feira_pvp_feira,
        pvp_livro_do_dia: b.feira_pvp_livro_do_dia,
        cover_jpg:        b.feira_cover_jpg,
        livro_do_dia_datas: b.discountDates,
        gr_shelf:         shelf,
      })
    }
    return byShelf
  }, [grBooks])

  // Books currently in Os Meus Livros (manually added)
  const manualIds = useMemo(() => new Set(Object.keys(manualBooks || {})), [manualBooks])

  // GR shelf books — filtered by shelf, catalogFilter (ldd), and search
  const grShelfBooks = useMemo(() => {
    if (!isGrMode) return []
    let all = (grFilter === 'goodreads-all'
      ? Object.values(grBooksByShelf).flat()
      : (grBooksByShelf[grFilter] || [])
    ).slice().sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'pt'))
    if (catalogFilter === 'ldd') all = all.filter(b => Boolean(b.pvp_livro_do_dia))
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(b =>
      (b.titulo             || '').toLowerCase().includes(q) ||
      (b.autor              || '').toLowerCase().includes(q) ||
      (b.participante_name  || '').toLowerCase().includes(q)
    )
  }, [isGrMode, grBooksByShelf, grFilter, catalogFilter, query])

  // ── Day view helpers ───────────────────────────────────

  // All fair books in catalog format, filtered by catalogFilter and query,
  // used as the data source for the day view in non-GR API mode when faireBooks is loaded.
  const allFaireForDayView = useMemo(() => {
    if (!faireBooks || isGrMode) return []
    let all = Object.entries(faireBooks).map(([isbn, b]) => ({
      isbn,
      titulo:             b.titulo,
      autor:              b.autor,
      participante_name:  b.participante,
      stand:              b.stand,
      pvp:                b.pvp,
      pvp_feira:          b.pvp_feira,
      pvp_livro_do_dia:   b.pvp_livro_do_dia || null,
      livro_do_dia_datas: b.datas || [],
      cover_jpg:          b.cover || '',
    }))
    if (catalogFilter === 'ldd') all = all.filter(b => Boolean(b.pvp_livro_do_dia))
    if (query.trim()) {
      const q = query.toLowerCase()
      all = all.filter(b =>
        (b.titulo             || '').toLowerCase().includes(q) ||
        (b.autor              || '').toLowerCase().includes(q) ||
        (b.participante_name  || '').toLowerCase().includes(q)
      )
    }
    return all.sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'pt'))
  }, [faireBooks, isGrMode, catalogFilter, query])

  // The "current" flat list of books driving the day view depends on the mode.
  const currentBooksForDayView = isGrMode ? grShelfBooks
    : faireBooks ? allFaireForDayView  // covers both search and no-search in API mode
    : results

  const allDays = useMemo(() => {
    const set = new Set()
    currentBooksForDayView.forEach(b => (b.livro_do_dia_datas || []).forEach(d => set.add(d)))
    return [...set].sort()
  }, [currentBooksForDayView])

  // Precomputed index: date string → books on that date (O(n) build, O(1) lookup)
  const dateToBooks = useMemo(() => {
    const idx = {}
    for (const b of currentBooksForDayView) {
      for (const d of (b.livro_do_dia_datas || [])) {
        if (!idx[d]) idx[d] = []
        idx[d].push(b)
      }
    }
    return idx
  }, [currentBooksForDayView])

  // Books with no discount dates — rendered as a separate "Sem data" section
  const noDatBooks = useMemo(() =>
    currentBooksForDayView.filter(b => (b.livro_do_dia_datas || []).length === 0),
    [currentBooksForDayView]
  )

  // Trigger lazy-load of all_feira_books.json when the user opens the day view
  // and we're not in GR mode (GR users load it via the userId effect in useBooks).
  useEffect(() => {
    if (viewMode !== 'days' || isGrMode || faireBooks) return
    onLoadFaireBooks?.()
    // onLoadFaireBooks is stable (useCallback) and idempotent — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, isGrMode, faireBooks])

  // Reset active day when filters/query change
  useEffect(() => { setActiveDay(null) }, [grFilter, catalogFilter, query])

  // Reset collapsed state when filters/view change.
  // "Sem data" starts collapsed in all-days mode, expanded when explicitly selected.
  useEffect(() => {
    setCollapsedGroups(activeDay === null ? new Set(['no-date']) : new Set())
  }, [grFilter, catalogFilter, query, activeDay, viewMode])

  // Reset API list when catalogFilter, grFilter, or query changes
  useEffect(() => {
    if (!isApiMode) return
    setResults([])
    setOffset(0)
    setHasMore(true)
    setFetchError(null)
  }, [query, catalogFilter, isApiMode])

  // Fetch one page from the Feira API (only in API modes)
  useEffect(() => {
    if (!isApiMode) return
    let cancelled = false
    const controller = new AbortController()
    setFetching(true)
    fetchingRef.current = true
    setFetchError(null)

    const feiraUrl = new URL('https://feiradolivrodelisboa.pt/_fll/wp-admin/admin-ajax.php/')
    feiraUrl.searchParams.set('action', 'getSearchedBooks')
    feiraUrl.searchParams.set('invisuais', '0')
    feiraUrl.searchParams.set('livros-do-dia', catalogFilter === 'ldd' ? '1' : '0')
    feiraUrl.searchParams.set('limit', String(LIMIT))
    feiraUrl.searchParams.set('offset', String(offset))
    if (query.trim()) feiraUrl.searchParams.set('search', query.trim())

    fetch(`${WORKER_URL}?url=${encodeURIComponent(feiraUrl.toString())}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => {
        if (cancelled) return
        const arr = Array.isArray(data) ? data : []
        setResults(prev => {
          const combined = offset === 0 ? arr : [...prev, ...arr]
          const seen = new Set()
          return combined.filter(b => {
            const key = normaliseIsbn(b.isbn) || b.titulo
            if (seen.has(key)) return false
            seen.add(key); return true
          })
        })
        setHasMore(arr.length === LIMIT)
        setFetching(false)
        fetchingRef.current = false
      })
      .catch(e => {
        if (cancelled || e.name === 'AbortError') return
        if (query.trim()) {
          setResults([]); setHasMore(false)
        } else {
          setFetchError('catalog_error')
        }
        setFetching(false)
        fetchingRef.current = false
      })

    return () => { cancelled = true; fetchingRef.current = false; controller.abort() }
  }, [query, catalogFilter, offset, isApiMode])

  // IntersectionObserver for infinite scroll (API list mode only)
  useEffect(() => {
    if (!isApiMode || viewMode !== 'list') return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !fetchingRef.current) setOffset(p => p + LIMIT) },
      { rootMargin: '300px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [isApiMode, hasMore, results.length, viewMode])

  function renderApiCard(book) {
    const isbn         = normaliseIsbn(book.isbn)
    const isLdd        = Boolean(book.pvp_livro_do_dia)
    const inList       = manualIds.has(isbn)
    const grShelfKey   = grIsbnToShelf.has(isbn) ? GR_SHELF_I18N[grIsbnToShelf.get(isbn)] : null
    const grShelfLabel = grShelfKey ? t(grShelfKey) : null
    return (
      <CatalogCard
        key={isbn || book.titulo}
        book={book}
        inList={inList}
        grShelfLabel={grShelfLabel}
        onAdd={() => onAdd(isbn, {
          titulo:           book.titulo,
          autor:            book.autor,
          participante:     book.participante_name,
          stand:            book.stand,
          pvp:              book.pvp,
          pvp_feira:        book.pvp_feira,
          pvp_livro_do_dia: book.pvp_livro_do_dia || null,
          livroDodia:       isLdd,
          datas:            book.livro_do_dia_datas || [],
          cover:            book.cover_jpg || book.cover_webp || '',
          gr_shelf:         grIsbnToShelf.get(isbn) || null,
        })}
        onRemove={() => onRemove(isbn)}
      />
    )
  }

  function renderGrCard(book) {
    const isbn     = book.isbn
    const isLdd    = Boolean(book.pvp_livro_do_dia)
    const inList   = manualIds.has(isbn)
    return (
      <CatalogCard
        key={`${isbn}-${book.gr_title || book.titulo}`}
        book={book}
        inList={inList}
        grShelfLabel={t(GR_SHELF_I18N[book.gr_shelf] || book.gr_shelf)}
        onAdd={() => onAdd(isbn, {
          titulo:           book.titulo,
          autor:            book.autor,
          participante:     book.participante_name,
          stand:            book.stand,
          pvp:              book.pvp,
          pvp_feira:        book.pvp_feira,
          pvp_livro_do_dia: book.pvp_livro_do_dia || null,
          livroDodia:       isLdd,
          datas:            book.livro_do_dia_datas || [],
          cover:            book.cover_jpg || '',
          gr_shelf:         book.gr_shelf,
        })}
        onRemove={() => onRemove(isbn)}
      />
    )
  }

  // Render a card in the correct format for the current mode
  const renderCard = (book) => isGrMode ? renderGrCard(book) : renderApiCard(book)

  // Which GR shelves actually have books
  const availableGrShelves = GR_SHELF_ORDER.filter(s => (grBooksByShelf[s] || []).length > 0)

  // Base GR books for the active grFilter (no catalogFilter applied) — used for catalog pill counts
  const grFilteredBase = useMemo(() => {
    if (!isGrMode) return []
    return grFilter === 'goodreads-all'
      ? Object.values(grBooksByShelf).flat()
      : (grBooksByShelf[grFilter] || [])
  }, [isGrMode, grFilter, grBooksByShelf])

  // Catalog pill counts
  const countAll = isGrMode          ? grFilteredBase.length
                 : isLocalSearchMode ? localSearchBase.length
                 : TOTAL_ALL_BOOKS
  const countLdd = isGrMode          ? grFilteredBase.filter(b => Boolean(b.pvp_livro_do_dia)).length
                 : isLocalSearchMode ? localSearchBase.filter(b => Boolean(b.pvp_livro_do_dia)).length
                 : TOTAL_LDD_BOOKS

  const grCount = (bks) => catalogFilter === 'ldd' ? bks.filter(b => Boolean(b.pvp_livro_do_dia)).length : bks.length

  // Day view: which dates to render and whether to show the "Sem data" section
  const datesToRender = activeDay === null    ? allDays
                      : activeDay === 'no-date' ? []
                      : [activeDay]
  const showSemData   = activeDay === null || activeDay === 'no-date'

  return (
    <div className="page">
      {/* Row 1: search bar + view toggle */}
      <div className="books-top-row">
        <input
          className="search-bar search-bar--inline"
          type="search"
          placeholder={t('catalog_search_ph')}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          autoFocus
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

      {needsOnboarding && onConnectGoodreads && (
        <button className="catalog-gr-prompt" onClick={onConnectGoodreads}>
          {t('catalog_gr_prompt')}
        </button>
      )}

      {/* Row 2: catalog filter tabs + optional day selector */}
      <div className="catalog-filter-row">
        <div className="shelf-tabs shelf-tabs--catalog">
          <button className={`shelf-tab ${catalogFilter === 'all' ? 'active' : ''}`} onClick={() => setCatalogFilter('all')}>
            {t('catalog_all')} <span className="shelf-tab__count">{fmtCount(countAll)}</span>
          </button>
          <button className={`shelf-tab ${catalogFilter === 'ldd' ? 'active' : ''}`} onClick={() => setCatalogFilter('ldd')}>
            {t('catalog_ldd')} <span className="shelf-tab__count">{fmtCount(countLdd)}</span>
          </button>
        </div>

        {viewMode === 'days' && (
          <select
            className="map-day-select map-day-select--inline"
            value={activeDay || ''}
            onChange={e => setActiveDay(e.target.value || null)}
          >
            <option value="">{t('books_all_days')}</option>
            {allDays.map(day => (
              <option key={day} value={day}>{formatDateShort(day, locale)}</option>
            ))}
            <option value="no-date">{t('books_no_date')}</option>
          </select>
        )}

        {availableGrShelves.length > 0 && (
          <div className="shelf-tabs shelf-tabs--gr">
            <span className="shelf-tabs__label">{t('catalog_gr_label')}</span>
            <button
              className={`shelf-tab shelf-tab--gr ${grFilter === 'goodreads-all' ? 'active' : ''}`}
              onClick={() => setGrFilter(f => f === 'goodreads-all' ? null : 'goodreads-all')}
            >
              {t('catalog_all')} <span className="shelf-tab__count">{grCount(Object.values(grBooksByShelf).flat())}</span>
            </button>
            {availableGrShelves.map(shelf => (
              <button
                key={shelf}
                className={`shelf-tab shelf-tab--gr ${grFilter === shelf ? 'active' : ''}`}
                onClick={() => setGrFilter(f => f === shelf ? null : shelf)}
              >
                {t(GR_SHELF_I18N[shelf])}
                <span className="shelf-tab__count">{grCount(grBooksByShelf[shelf] || [])}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Day-grouped view ───────────────────────────────── */}
      {viewMode === 'days' ? (
        /* Loading faireBooks on demand (non-GR users only) */
        !isGrMode && !faireBooks ? (
          <div className="loading">
            <div className="loading-spinner" />
            <p className="loading-detail">{t('loading_catalog')}</p>
          </div>
        ) : datesToRender.length === 0 && !(showSemData && noDatBooks.length > 0) ? (
          <p className="empty-state">
            {activeDay && activeDay !== 'no-date'
              ? t('catalog_no_results', formatDate(activeDay, locale))
              : t('catalog_empty')}
          </p>
        ) : (
          <>
            {datesToRender.map(date => (
              <DaySection
                key={date}
                label={formatDate(date, locale)}
                books={dateToBooks[date] || []}
                collapsed={collapsedGroups.has(date)}
                onToggle={() => toggleGroup(date)}
                renderCard={renderCard}
                isNoDate={false}
                t={t}
              />
            ))}
            {showSemData && noDatBooks.length > 0 && (
              <DaySection
                key="no-date"
                label={t('books_no_date')}
                books={noDatBooks}
                collapsed={collapsedGroups.has('no-date')}
                onToggle={() => toggleGroup('no-date')}
                renderCard={renderCard}
                isNoDate={true}
                t={t}
              />
            )}
          </>
        )

      ) : isGrMode ? (
        /* ── GR shelf list view ─────────── */
        grShelfBooks.length === 0
          ? <p className="catalog-count">
              {query.trim() ? t('catalog_no_results', query.trim()) : t('catalog_empty')}
            </p>
          : <div className="book-list">{grShelfBooks.map(renderGrCard)}</div>

      ) : isLocalSearchMode ? (
        /* ── Local search list view ── */
        <>
          {localSearchResults.length === 0
            ? <p className="catalog-count">{t('catalog_no_results', query.trim())}</p>
            : <div className="book-list">{localSearchResults.map(renderApiCard)}</div>
          }
        </>

      ) : (
        /* ── API list view ────── */
        fetchError ? (
          <p className="empty-state">{t(fetchError)}</p>
        ) : (
          <>
            {results.length === 0 && !fetching && (
              <p className="catalog-count">
                {query.trim() ? t('catalog_no_results', query.trim()) : t('catalog_empty')}
              </p>
            )}
            <div className="book-list">{results.map(renderApiCard)}</div>
            {hasMore && (
              <div ref={sentinelRef} className="catalog-sentinel">
                {fetching && results.length > 0 && <p className="catalog-count">{t('catalog_loading_more')}</p>}
              </div>
            )}
            {!hasMore && results.length > 0 && (
              <p className="catalog-count" style={{ textAlign: 'center', opacity: 0.5, padding: '16px 0' }}>
                {t('catalog_end')}
              </p>
            )}
          </>
        )
      )}
    </div>
  )
}
