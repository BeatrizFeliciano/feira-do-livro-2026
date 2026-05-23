import { ShelfBadge } from './ShelfBadge'

function Stars({ rating }) {
  const n = parseInt(rating, 10)
  if (!n) return null
  return (
    <span className="stars" title={`${n}/5`}>
      {'★'.repeat(n)}{'☆'.repeat(5 - n)}
    </span>
  )
}

function PriceBlock({ pvp, pvpFeira, pvpDia }) {
  const savings = pvp && pvpDia
    ? Math.round((1 - parseFloat(pvpDia) / parseFloat(pvp)) * 100)
    : 0
  return (
    <div className="price-block">
      <span className="price-original">€{parseFloat(pvp).toFixed(2)}</span>
      <span className="price-arrow">→</span>
      <span className="price-feira">€{parseFloat(pvpFeira).toFixed(2)}</span>
      <span className="price-arrow">→</span>
      <span className="price-dia">€{parseFloat(pvpDia).toFixed(2)}</span>
      {savings > 0 && <span className="price-savings">-{savings}%</span>}
    </div>
  )
}

export function BookCard({ book, onToggleWant, onToggleBought }) {
  return (
    <div className={`book-card ${book.bought ? 'book-card--bought' : ''}`}>
      <img
        className="book-card__cover"
        src={book.feira_cover_jpg}
        alt={book.gr_title}
        loading="lazy"
        onError={e => { e.target.style.visibility = 'hidden' }}
      />
      <div className="book-card__body">
        <div className="book-card__header">
          <div className="book-card__title-row">
            <span className="book-card__title">{book.gr_title}</span>
          </div>
          <span className="book-card__author">{book.gr_author}</span>
        </div>
        <div className="book-card__meta">
          <ShelfBadge shelf={book.gr_shelf} />
          <Stars rating={book.gr_my_rating} />
          <span className="book-card__stand">{book.feira_stand} · {book.feira_participante}</span>
        </div>
        <PriceBlock
          pvp={book.feira_pvp}
          pvpFeira={book.feira_pvp_feira}
          pvpDia={book.feira_pvp_livro_do_dia}
        />
        <div className="book-card__dates">
          {book.discountDates.map(d => (
            <span key={d} className="date-chip">
              {new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
            </span>
          ))}
        </div>
      </div>
      <div className="book-card__actions">
        <button
          className={`btn-action btn-want ${book.wantToBuy ? 'active' : ''}`}
          onClick={() => onToggleWant(book.id)}
          title={book.wantToBuy ? 'Remover da lista' : 'Quero comprar'}
        >
          {book.wantToBuy ? '♥ Quero' : '♡ Quero'}
        </button>
        <button
          className={`btn-action btn-bought ${book.bought ? 'active' : ''}`}
          onClick={() => onToggleBought(book.id)}
          title={book.bought ? 'Marcar como não comprado' : 'Marcar como comprado'}
        >
          {book.bought ? '✓ Comprado' : '○ Comprado'}
        </button>
      </div>
    </div>
  )
}
