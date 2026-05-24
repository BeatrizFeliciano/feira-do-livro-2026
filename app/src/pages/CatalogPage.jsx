import { useState, useEffect, useMemo, useRef } from 'react'
import { WORKER_URL } from '../constants'

const LIMIT = 50
const TOTAL_ALL_BOOKS = 45234  // empirically determined from the API (2026-05-24)

const normaliseIsbn = isbn => (isbn || '').replace(/\D/g, '')

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function CatalogCard({ book, isLdd, inList, isManual, onAdd, onRemove }) {
  return (
    <div className="catalog-card">
      <img
        className="catalog-card__cover"
        src={book.cover_jpg || book.cover_webp}
        alt={book.titulo}
        loading="lazy"
        onError={e => { e.target.style.visibility = 'hidden' }}
      />
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
  const [knownTotal, setKnownTotal] = useState(null)

  const query = useDebounce(inputVal, 300)

  // Reset to first page when query or filter changes
  useEffect(() => { setOffset(0) }, [query, lddOnly])

  // Known total: use exact counts where possible, discover from last page otherwise
  useEffect(() => {
    if (lddOnly && faireBooks) {
      // Exact: we have all LDD books in memory
      setKnownTotal(Object.keys(faireBooks).length)
    } else if (!query.trim()) {
      // No search active: use empirically-determined constant
      setKnownTotal(TOTAL_ALL_BOOKS)
    } else {
      // Searching: reset; will be filled in when we hit the last page
      setKnownTotal(null)
    }
  }, [lddOnly, query, faireBooks])

  // Fetch from Feira API via Worker
  useEffect(() => {
    const controller = new AbortController()
    setFetching(true)
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
        const arr = Array.isArray(data) ? data : []
        setResults(arr)
        setHasMore(arr.length === LIMIT)
        // If this is the last page, we now know the exact total
        if (arr.length < LIMIT) setKnownTotal(offset + arr.length)
        setFetching(false)
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setFetchError('Não foi possível carregar o catálogo.')
          setFetching(false)
        }
      })

    return () => controller.abort()
  }, [query, lddOnly, offset])

  // Scroll to top when page changes
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [offset])

  const matchedIds  = useMemo(() => new Set(books.filter(b => !b.manuallyAdded).map(b => b.id)), [books])
  const manualIds   = useMemo(() => new Set(Object.keys(manualBooks || {})), [manualBooks])

  const page       = Math.floor(offset / LIMIT) + 1
  const totalPages = knownTotal !== null ? Math.ceil(knownTotal / LIMIT) : null

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

      <div className="shelf-tabs" style={{ marginBottom: 8 }}>
        <button
          className={`shelf-tab ${lddOnly ? 'active' : ''}`}
          onClick={() => setLddOnly(v => !v)}
        >
          ⚡ Livro do Dia
        </button>
      </div>

      {fetchError ? (
        <p className="empty-state">{fetchError}</p>
      ) : (
        <>
          <p className="catalog-count">
            {fetching ? 'A carregar…' : results.length === 0 ? 'Nenhum livro encontrado.' : (
              knownTotal !== null
                ? `${knownTotal.toLocaleString('pt-PT')} livro${knownTotal !== 1 ? 's' : ''}`
                : `${results.length === LIMIT ? `${LIMIT}+` : results.length} resultado${results.length !== 1 ? 's' : ''}`
            )}
          </p>

          <div className="book-list">
            {results.map(book => {
              const isbn    = normaliseIsbn(book.isbn)
              const isLdd   = Boolean(faireBooks?.[isbn])
              const isManual = manualIds.has(isbn)
              const inList  = matchedIds.has(isbn) || isManual
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

          {(offset > 0 || hasMore) && (
            <div className="pagination">
              <button
                className="pagination__btn"
                onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
                disabled={offset === 0 || fetching}
              >
                ‹ Anterior
              </button>
              <span className="pagination__info">
                {totalPages !== null ? `${page} / ${totalPages}` : `Página ${page}`}
              </span>
              <button
                className="pagination__btn"
                onClick={() => setOffset(o => o + LIMIT)}
                disabled={!hasMore || fetching}
              >
                Próxima ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
