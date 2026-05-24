import { useState, useMemo, useEffect } from 'react'
import { BookCard } from '../components/BookCard'

const PAGE_SIZE = 50

const SHELVES = [
  { key: 'all',               label: 'Todos' },
  { key: 'ldd',               label: 'Livro do Dia' },
  { key: 'want',              label: 'Quero comprar' },
  { key: 'to-read',           label: 'Para ler' },
  { key: 'currently-reading', label: 'A ler' },
  { key: 'read',              label: 'Lidos' },
  { key: 'did-not-finish',    label: 'Desistiu' },
]

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

export function BooksPage({ books, onToggleWant, onToggleBought, onShowOnMap, onRemove }) {
  const [shelf, setShelf] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() =>
    books
      .filter(b => {
        if (shelf === 'all')  return true
        if (shelf === 'ldd')  return b.livroDodia
        if (shelf === 'want') return b.wantToBuy
        return b.gr_shelf === shelf
      })
      .filter(b => query === '' || matches(b, query))
      .sort((a, b) => a.gr_title.localeCompare(b.gr_title, 'pt')),
    [books, shelf, query]
  )

  // Reset to page 1 when filter/query changes
  useEffect(() => { setPage(1) }, [shelf, query])

  // Scroll to top when page changes
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [page])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const wantedBooks = books.filter(b => b.wantToBuy && !b.bought)
  const totalSavings = wantedBooks.reduce((sum, b) => {
    if (!b.livroDodia) return sum
    return sum + (parseFloat(b.feira_pvp) - parseFloat(b.feira_pvp_livro_do_dia))
  }, 0)
  const totalCost = wantedBooks.reduce((sum, b) =>
    sum + parseFloat(b.livroDodia ? b.feira_pvp_livro_do_dia : b.feira_pvp_feira)
  , 0)

  return (
    <div className="page">
      {wantedBooks.length > 0 && (
        <div className="summary-bar">
          <span><strong>{wantedBooks.length}</strong> livro{wantedBooks.length !== 1 ? 's' : ''} para comprar</span>
          <span className="summary-bar__cost">Total: <strong>€{totalCost.toFixed(2)}</strong></span>
          <span className="summary-bar__savings">Poupança: <strong>€{totalSavings.toFixed(2)}</strong></span>
        </div>
      )}

      <input
        className="search-bar"
        type="search"
        placeholder="Pesquisar por título, autor, editora ou stand..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      <div className="shelf-tabs">
        {SHELVES.map(s => {
          const count = s.key === 'all'  ? books.length
            : s.key === 'ldd'  ? books.filter(b => b.livroDodia).length
            : s.key === 'want' ? books.filter(b => b.wantToBuy).length
            : books.filter(b => b.gr_shelf === s.key).length
          return (
            <button
              key={s.key}
              className={`shelf-tab ${shelf === s.key ? 'active' : ''}`}
              onClick={() => setShelf(s.key)}
            >
              {s.label} <span className="shelf-tab__count">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="book-list">
        {pageItems.map(book => (
          <BookCard
            key={book.id}
            book={book}
            onToggleWant={onToggleWant}
            onToggleBought={onToggleBought}
            onShowOnMap={onShowOnMap}
            onRemove={onRemove}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination__btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ‹ Anterior
          </button>
          <span className="pagination__info">
            {page.toLocaleString('pt-PT')} / {totalPages.toLocaleString('pt-PT')}
          </span>
          <button
            className="pagination__btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Próxima ›
          </button>
        </div>
      )}
    </div>
  )
}
