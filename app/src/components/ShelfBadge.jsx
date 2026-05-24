const LABELS = {
  'to-read': 'Para ler',
  'read': 'Lido',
  'currently-reading': 'A ler',
  'did-not-finish': 'Desistiu',
}

export function ShelfBadge({ shelf }) {
  if (!shelf) return null
  return (
    <span className={`shelf-badge shelf-badge--${shelf}`}>
      {LABELS[shelf] || shelf}
    </span>
  )
}
