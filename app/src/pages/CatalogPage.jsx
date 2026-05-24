import { useState, useMemo } from 'react'

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

  const inListIds  = useMemo(() => new Set(books.map(b => b.id)), [books])
  const manualIds  = useMemo(() => new Set(books.filter(b => b.manuallyAdded).map(b => b.id)), [books])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2 || !faireBooks) return []
    return Object.entries(faireBooks)
      .filter(([, fb]) =>
        fb.titulo.toLowerCase().includes(q) ||
        (fb.autor        || '').toLowerCase().includes(q) ||
        (fb.participante || '').toLowerCase().includes(q)
      )
      .map(([isbn, fb]) => ({ isbn, ...fb }))
      .slice(0, 100)
  }, [query, faireBooks])

  const total = faireBooks ? Object.keys(faireBooks).length : null

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

      {query.trim().length < 2 ? (
        <p className="empty-state">
          Pesquisa entre{total ? ` os ${total.toLocaleString('pt-PT')}` : ''} livros disponíveis na feira para adicionares à tua lista.
        </p>
      ) : results.length === 0 ? (
        <p className="empty-state">Nenhum livro encontrado.</p>
      ) : (
        <>
          <p className="catalog-count">
            {results.length}{results.length === 100 ? '+' : ''} resultado{results.length !== 1 ? 's' : ''}
          </p>
          <div className="book-list">
            {results.map(({ isbn, ...fb }) => (
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
        </>
      )}
    </div>
  )
}
