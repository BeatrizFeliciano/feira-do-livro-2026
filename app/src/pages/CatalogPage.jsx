import { useState, useMemo, useEffect } from 'react'

const PAGE_SIZE = 50

function CatalogCard({ fb, inList, isManual, onAdd, onRemove }) {
  return (
    <div className="catalog-card">
      <img
        className="catalog-card__cover"
        src={fb.cover}
        alt={fb.titulo}
        loading="lazy"
        onError={e => { e.target.style.visibility = 'hidden' }}
      />
      <div className="catalog-card__body">
        <span className="catalog-card__title">{fb.titulo}</span>
        <span className="catalog-card__author">{fb.autor}</span>
        <span className="catalog-card__meta">{fb.stand} · {fb.participante}</span>
        <div className="catalog-card__price">
          <span className="price-original">€{parseFloat(fb.pvp).toFixed(2)}</span>
          <span className="price-arrow">→</span>
          <span className="price-dia">€{parseFloat(fb.pvp_livro_do_dia).toFixed(2)}</span>
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

export function CatalogPage({ faireBooks, books, onAdd, onRemove }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const inListIds = useMemo(() => new Set(books.map(b => b.id)), [books])
  const manualIds = useMemo(() => new Set(books.filter(b => b.manuallyAdded).map(b => b.id)), [books])

  // Sort all feira books alphabetically once
  const allSorted = useMemo(() => {
    if (!faireBooks) return []
    return Object.entries(faireBooks)
      .map(([isbn, fb]) => ({ isbn, ...fb }))
      .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt', { sensitivity: 'base' }))
  }, [faireBooks])

  // Filter by query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allSorted
    return allSorted.filter(fb =>
      fb.titulo.toLowerCase().includes(q) ||
      (fb.autor || '').toLowerCase().includes(q) ||
      (fb.participante || '').toLowerCase().includes(q)
    )
  }, [query, allSorted])

  // Reset to page 1 whenever the query changes
  useEffect(() => { setPage(1) }, [query])

  // Scroll to top when the page changes
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [page])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function goToPage(n) {
    setPage(Math.max(1, Math.min(totalPages, n)))
  }

  return (
    <div className="page">
      <input
        className="search-bar"
        type="search"
        placeholder="Pesquisar por título, autor ou editora…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoFocus
      />

      {!faireBooks ? (
        <p className="empty-state">A carregar catálogo…</p>
      ) : (
        <>
          <p className="catalog-count">
            {filtered.length.toLocaleString('pt-PT')}{' '}
            livro{filtered.length !== 1 ? 's' : ''}{' '}
            {query.trim() ? `encontrado${filtered.length !== 1 ? 's' : ''}` : 'na feira'}
          </p>

          <div className="book-list">
            {pageItems.map(({ isbn, ...fb }) => (
              <CatalogCard
                key={isbn}
                fb={fb}
                inList={inListIds.has(isbn)}
                isManual={manualIds.has(isbn)}
                onAdd={() => onAdd(isbn)}
                onRemove={() => onRemove(isbn)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination__btn"
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
              >
                ‹ Anterior
              </button>
              <span className="pagination__info">
                {page.toLocaleString('pt-PT')} / {totalPages.toLocaleString('pt-PT')}
              </span>
              <button
                className="pagination__btn"
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages}
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
