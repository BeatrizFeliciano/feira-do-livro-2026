import { useState, useEffect, useMemo, useRef } from 'react'
import { WORKER_URL } from '../constants'

const LIMIT = 50
const TOTAL_ALL_BOOKS = 45234  // empirically determined from the API (2026-05-24)

const normaliseIsbn = isbn => (isbn || '').replace(/\D/g, '')
const fmtCount = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function CatalogCard({ book, isLdd, inList, isManual, onAdd, onRemove }) {
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
        <span className="catalog-card__title">{book.titulo}</span>
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
        {inList && !isManual ? (
          <span className="catalog-badge catalog-badge--gr" title="Correspondido via Goodreads">✓ Goodreads</span>
        ) : inList && isManual ? (
          <button className="btn-action catalog-badge--added" onClick={onRemove} title="Remover da lista">
            ✓ Na lista
          </button>
        ) : (
          <button className="btn-action catalog-badge--add" onClick={onAdd}>
            + Adicionar
          </button>
        )}
      </div>
    </div>
  )
}

export function CatalogPage({ faireBooks, manualBooks, books, onAdd, onRemove }) {
  const [inputVal, setInputVal]     = useState('')
  const [lddOnly, setLddOnly]       = useState(false)
  const [offset, setOffset]         = useState(0)
  const [results, setResults]       = useState([])
  const [hasMore, setHasMore]       = useState(true)
  const [fetching, setFetching]     = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const query       = useDebounce(inputVal, 300)
  const sentinelRef = useRef(null)
  // Ref so the IntersectionObserver callback can read the current fetching state
  // without needing to be re-created every time it changes.
  const fetchingRef = useRef(false)

  // Reset list when search query or filter changes
  useEffect(() => {
    setResults([])
    setOffset(0)
    setHasMore(true)
    setFetchError(null)
  }, [query, lddOnly])

  // Fetch one page from the Feira API via Worker
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setFetching(true)
    fetchingRef.current = true
    setFetchError(null)

    const feiraUrl = new URL('https://feiradolivrodelisboa.pt/_fll/wp-admin/admin-ajax.php/')
    feiraUrl.searchParams.set('action', 'getSearchedBooks')
    feiraUrl.searchParams.set('invisuais', '0')
    feiraUrl.searchParams.set('livros-do-dia', lddOnly ? '1' : '0')
    feiraUrl.searchParams.set('limit', String(LIMIT))
    feiraUrl.searchParams.set('offset', String(offset))
    if (query.trim()) feiraUrl.searchParams.set('search', query.trim())

    fetch(`${WORKER_URL}?url=${encodeURIComponent(feiraUrl.toString())}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => {
        if (cancelled) return
        const arr = Array.isArray(data) ? data : []
        // offset 0 → fresh list; offset > 0 → append to existing
        setResults(prev => offset === 0 ? arr : [...prev, ...arr])
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
  }, [query, lddOnly, offset])

  // IntersectionObserver — load next page when sentinel enters the viewport
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fetchingRef.current) {
          setOffset(prev => prev + LIMIT)
        }
      },
      { rootMargin: '300px' }   // start loading before the user actually hits the bottom
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, results.length])  // re-bind after each new batch so the sentinel is visible

  const matchedIds = useMemo(() => new Set(books.filter(b => !b.manuallyAdded).map(b => b.id)), [books])
  const manualIds  = useMemo(() => new Set(Object.keys(manualBooks || {})), [manualBooks])

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

      <div className="shelf-tabs">
        <button
          className={`shelf-tab ${!lddOnly ? 'active' : ''}`}
          onClick={() => setLddOnly(false)}
        >
          Todos <span className="shelf-tab__count">{fmtCount(TOTAL_ALL_BOOKS)}</span>
        </button>
        <button
          className={`shelf-tab ${lddOnly ? 'active' : ''}`}
          onClick={() => setLddOnly(true)}
        >
          Livros do Dia <span className="shelf-tab__count">{faireBooks ? fmtCount(Object.keys(faireBooks).length) : '…'}</span>
        </button>
      </div>

      {fetchError ? (
        <p className="empty-state">{fetchError}</p>
      ) : (
        <>
          {results.length === 0 && !fetching && (
            <p className="catalog-count">Nenhum livro encontrado.</p>
          )}

          <div className="book-list">
            {results.map(book => {
              const isbn     = normaliseIsbn(book.isbn)
              const isLdd    = Boolean(faireBooks?.[isbn])
              const isManual = manualIds.has(isbn)
              const inList   = matchedIds.has(isbn) || isManual
              return (
                <CatalogCard
                  key={isbn || book.titulo}
                  book={book}
                  isLdd={isLdd}
                  inList={inList}
                  isManual={isManual}
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
                  })}
                  onRemove={() => onRemove(isbn)}
                />
              )
            })}
          </div>

          {/* Sentinel div — observed by IntersectionObserver to trigger the next page load */}
          {hasMore && (
            <div ref={sentinelRef} className="catalog-sentinel">
              {fetching && results.length > 0 && (
                <p className="catalog-count">A carregar mais…</p>
              )}
            </div>
          )}

          {!hasMore && results.length > 0 && (
            <p className="catalog-count" style={{ textAlign: 'center', opacity: 0.5, padding: '16px 0' }}>
              — fim dos resultados —
            </p>
          )}
        </>
      )}
    </div>
  )
}
