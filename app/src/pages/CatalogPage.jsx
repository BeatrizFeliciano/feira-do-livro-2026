import { useState, useEffect, useMemo, useRef } from 'react'
import { WORKER_URL } from '../constants'

const LIMIT = 50
const TOTAL_ALL_BOOKS = 45234
const TOTAL_LDD_BOOKS = 5809

const normaliseIsbn = isbn => (isbn || '').replace(/\D/g, '')
const fmtCount = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const GR_SHELF_LABELS = {
  'to-read':           'Para ler',
  'currently-reading': 'A ler',
  'read':              'Lidos',
  'did-not-finish':    'Desistiu',
}
const GR_SHELF_ORDER = ['to-read', 'currently-reading', 'read', 'did-not-finish']

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function CatalogCard({ book, inList, grShelfLabel, onAdd, onRemove }) {
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
          title={inList ? 'Remover da lista' : 'Quero comprar'}
        >
          {inList ? '♥ Quero' : '♡ Quero'}
        </button>
      </div>
    </div>
  )
}

export function CatalogPage({ manualBooks, books, grBooks, needsOnboarding, onAdd, onRemove, onConnectGoodreads }) {
  const [inputVal, setInputVal]     = useState('')
  const [mode, setMode]             = useState('all')  // 'all' | 'ldd' | gr_shelf key
  const [offset, setOffset]         = useState(0)
  const [results, setResults]       = useState([])
  const [hasMore, setHasMore]       = useState(true)
  const [fetching, setFetching]     = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const query       = useDebounce(inputVal, 300)
  const sentinelRef = useRef(null)
  const fetchingRef = useRef(false)

  const isApiMode = mode === 'all' || mode === 'ldd'
  const isGrMode  = !isApiMode

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

  // GR shelf books visible in the current shelf tab, filtered by search
  const grShelfBooks = useMemo(() => {
    if (!isGrMode) return []
    const all = (mode === 'goodreads-all'
      ? Object.values(grBooksByShelf).flat()
      : (grBooksByShelf[mode] || [])
    ).slice().sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'pt'))
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(b =>
      (b.titulo || '').toLowerCase().includes(q) ||
      (b.autor  || '').toLowerCase().includes(q)
    )
  }, [isGrMode, grBooksByShelf, mode, query])

  // Reset API list when mode or debounced query changes
  useEffect(() => {
    if (!isApiMode) return
    setResults([])
    setOffset(0)
    setHasMore(true)
    setFetchError(null)
  }, [query, mode, isApiMode])

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
    feiraUrl.searchParams.set('livros-do-dia', mode === 'ldd' ? '1' : '0')
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
        setFetchError('Não foi possível carregar o catálogo.')
        setFetching(false)
        fetchingRef.current = false
      })

    return () => { cancelled = true; fetchingRef.current = false; controller.abort() }
  }, [query, mode, offset, isApiMode])

  // IntersectionObserver for infinite scroll (API modes only)
  useEffect(() => {
    if (!isApiMode) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !fetchingRef.current) setOffset(p => p + LIMIT) },
      { rootMargin: '300px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [isApiMode, hasMore, results.length])

  function renderApiCard(book) {
    const isbn         = normaliseIsbn(book.isbn)
    const isLdd        = Boolean(book.pvp_livro_do_dia)
    const inList       = manualIds.has(isbn)
    const grShelfLabel = grIsbnToShelf.has(isbn) ? GR_SHELF_LABELS[grIsbnToShelf.get(isbn)] : null
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
        key={isbn || book.titulo}
        book={book}
        inList={inList}
        grShelfLabel={GR_SHELF_LABELS[book.gr_shelf]}
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

  // Which GR shelves actually have books
  const availableGrShelves = GR_SHELF_ORDER.filter(s => (grBooksByShelf[s] || []).length > 0)

  return (
    <div className="page">
      <input
        className="search-bar"
        type="search"
        placeholder="Pesquisar por título, autor ou editora…"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        autoFocus
      />

      {needsOnboarding && onConnectGoodreads && (
        <button className="catalog-gr-prompt" onClick={onConnectGoodreads}>
          Ligar Goodreads para ver os teus livros aqui →
        </button>
      )}

      <div className="catalog-filter-row">
        <div className="shelf-tabs shelf-tabs--catalog">
          <button className={`shelf-tab ${mode === 'all' ? 'active' : ''}`} onClick={() => setMode('all')}>
            Todos <span className="shelf-tab__count">{fmtCount(TOTAL_ALL_BOOKS)}</span>
          </button>
          <button className={`shelf-tab ${mode === 'ldd' ? 'active' : ''}`} onClick={() => setMode('ldd')}>
            Livros do Dia <span className="shelf-tab__count">{fmtCount(TOTAL_LDD_BOOKS)}</span>
          </button>
        </div>

        {availableGrShelves.length > 0 && (
          <div className="shelf-tabs shelf-tabs--gr">
            <span className="shelf-tabs__label">Goodreads</span>
            <button
              className={`shelf-tab shelf-tab--gr ${mode === 'goodreads-all' ? 'active' : ''}`}
              onClick={() => setMode('goodreads-all')}
            >
              Todos <span className="shelf-tab__count">{grBooks.length}</span>
            </button>
            {availableGrShelves.map(shelf => (
              <button
                key={shelf}
                className={`shelf-tab shelf-tab--gr ${mode === shelf ? 'active' : ''}`}
                onClick={() => setMode(shelf)}
              >
                {GR_SHELF_LABELS[shelf]}
                <span className="shelf-tab__count">{(grBooksByShelf[shelf] || []).length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── GR shelf view (client-side) ─────────── */}
      {isGrMode ? (
        grShelfBooks.length === 0
          ? <p className="catalog-count">Nenhum livro encontrado.</p>
          : <div className="book-list">{grShelfBooks.map(renderGrCard)}</div>

      ) : (
        /* ── API view (Todos / Livros do Dia) ────── */
        fetchError ? (
          <p className="empty-state">{fetchError}</p>
        ) : (
          <>
            {results.length === 0 && !fetching && (
              <p className="catalog-count">Nenhum livro encontrado.</p>
            )}
            <div className="book-list">{results.map(renderApiCard)}</div>
            {hasMore && (
              <div ref={sentinelRef} className="catalog-sentinel">
                {fetching && results.length > 0 && <p className="catalog-count">A carregar mais…</p>}
              </div>
            )}
            {!hasMore && results.length > 0 && (
              <p className="catalog-count" style={{ textAlign: 'center', opacity: 0.5, padding: '16px 0' }}>
                — fim dos resultados —
              </p>
            )}
          </>
        )
      )}
    </div>
  )
}
