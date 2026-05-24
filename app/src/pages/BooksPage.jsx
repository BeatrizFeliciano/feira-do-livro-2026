import { useState } from 'react'
import { BookCard } from '../components/BookCard'

const SHELVES = [
  { key: 'all', label: 'Todos' },
  { key: 'want', label: 'Quero comprar' },
  { key: 'to-read', label: 'Para ler' },
  { key: 'currently-reading', label: 'A ler' },
  { key: 'read', label: 'Lidos' },
  { key: 'did-not-finish', label: 'Desistiu' },
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

export function BooksPage({ books, onToggleWant, onToggleBought, onShowOnMap }) {
  const [shelf, setShelf] = useState('all')
  const [query, setQuery] = useState('')

  const filtered = books
    .filter(b => shelf === 'all' || (shelf === 'want' ? b.wantToBuy : b.gr_shelf === shelf))
    .filter(b => query === '' || matches(b, query))
    .sort((a, b) => a.gr_title.localeCompare(b.gr_title, 'pt'))

  const wantedBooks = books.filter(b => b.wantToBuy && !b.bought)
  const totalSavings = wantedBooks.reduce((sum, b) => {
    return sum + (parseFloat(b.feira_pvp) - parseFloat(b.feira_pvp_livro_do_dia))
  }, 0)
  const totalCost = wantedBooks.reduce((sum, b) => sum + parseFloat(b.feira_pvp_livro_do_dia), 0)

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
          const count = s.key === 'all' ? books.length : s.key === 'want' ? books.filter(b => b.wantToBuy).length : books.filter(b => b.gr_shelf === s.key).length
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
        {filtered.map(book => (
          <BookCard
            key={book.id}
            book={book}
            onToggleWant={onToggleWant}
            onToggleBought={onToggleBought}
            onShowOnMap={onShowOnMap}
          />
        ))}
      </div>
    </div>
  )
}
