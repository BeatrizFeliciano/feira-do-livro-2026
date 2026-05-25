# Feira do Livro — All-Books Catalog, Infinite Scroll & UX Improvements

## Context

Fourth phase. Expands the Catalog tab from ~5,809 "livros do dia" (static JSON) to all ~45,234 fair books fetched live from the Feira API via a CORS proxy. Introduces infinite scroll, removes pagination from the Catalog, adds a "Livros do Dia" filter everywhere, and adds a remove-book feature with a confirmation dialog.

---

## Cloudflare Worker Extension

The existing Goodreads CORS proxy worker was extended to also proxy the Feira API.

**`worker/index.js`** — add Feira origin to the allowlist:
```js
const ALLOWED_PREFIXES = [
  'https://www.goodreads.com',
  'https://feiradolivrodelisboa.pt/_fll/wp-admin/admin-ajax.php',  // NEW
]
```

The worker accepts `?url=ENCODED` and forwards the request with CORS headers. No other changes needed.

---

## `src/constants.js` (new file)

Extracted `WORKER_URL` from `useBooks.js` into a shared constant so `CatalogPage` can also import it:

```js
export const WORKER_URL = 'https://goodreads-proxy.beatrizfeliciano1999.workers.dev'
```

---

## Feira Books JSON — `livroDodia` field

`generate_feira_books.py` now writes `"livroDodia": True` on every entry. `feira_books.json` is regenerated (5,809 books, same content, one new field). This field is the source of truth for LDD status — if `faireBooks[isbn]` exists and has `livroDodia: true`, the book is a livro do dia.

---

## `src/hooks/useBooks.js` changes

### localStorage keys

| Key | Contents |
|---|---|
| `feira_goodreads_id` | Goodreads numeric user ID |
| `feira_books_cache` | JSON array of matched book objects |
| `feira_book_state` | `{ [isbn]: { wantToBuy, bought } }` |
| `feira_manual_books` | `{ [isbn]: fullBookObj }` — **replaces** `feira_manual_isbns` |
| `feira_hidden_books` | `[isbn, …]` — books dismissed via the remove button |

### Manual books: ISBN array → full object store

Old: `feira_manual_isbns` — just an array of ISBNs, required `faireBooks` lookup to get book data. Failed for non-LDD books (not in `faireBooks`).

New: `feira_manual_books` — full book objects keyed by ISBN, no `faireBooks` lookup needed.

**Migration** runs once on load if the old key is present:
```js
useEffect(() => {
  if (!faireBooks) return
  const oldIsbns = JSON.parse(localStorage.getItem('feira_manual_isbns') || 'null')
  if (oldIsbns?.length && Object.keys(manualBooks).length === 0) {
    const migrated = {}
    oldIsbns.forEach(isbn => { if (faireBooks[isbn]) migrated[isbn] = faireBooks[isbn] })
    saveManualBooks(migrated)
    localStorage.removeItem('feira_manual_isbns')
    setManualBooks(migrated)
  }
}, [faireBooks])
```

### `addManual(isbn, bookData)`

Now receives a full book data object from `CatalogPage` (instead of just an ISBN). Stores it in `manualBooks` and sets `wantToBuy: true` in `bookState`.

### Manual books synthesis

```js
const manualBooksArr = Object.entries(manualBooks)
  .filter(([isbn]) => !matchedIds.has(isbn) && !hiddenBooks.has(isbn))
  .map(([isbn, fb]) => ({
    id: isbn,
    gr_title: fb.titulo, gr_author: fb.autor,
    gr_shelf: null, gr_my_rating: 0,
    feira_titulo: fb.titulo, feira_autor: fb.autor,
    feira_participante: fb.participante, feira_stand: fb.stand,
    feira_pvp: fb.pvp, feira_pvp_feira: fb.pvp_feira,
    feira_pvp_livro_do_dia: fb.pvp_livro_do_dia,
    discountDates: fb.datas || [],
    livroDodia: fb.livroDodia ?? false,
    feira_cover_jpg: fb.cover,
    manuallyAdded: true,
  }))
```

### `livroDodia` field on all books

`createMatch()` sets `livroDodia: fb.livroDodia ?? true` (all `faireBooks` entries are LDD books).

The final `books` array construction adds a cache-safe fallback:
```js
const books = [...(rawBooks || []).filter(b => !hiddenBooks.has(b.id)), ...manualBooksArr].map(b => ({
  ...b,
  // Fallback for caches written before livroDodia was introduced.
  // All rawBooks (Goodreads-matched) are LDD; manuallyAdded defaults to false.
  livroDodia: b.livroDodia ?? !b.manuallyAdded,
  wantToBuy: bookState[b.id]?.wantToBuy ?? (b.manuallyAdded ? true : false),
  bought: bookState[b.id]?.bought ?? false,
}))
```

### `hiddenBooks` — remove book

```js
const LS_HIDDEN_KEY = 'feira_hidden_books'
const [hiddenBooks, setHiddenBooks] = useState(loadHiddenBooks)  // Set of ISBNs
```

`rawBooks` and `manualBooksArr` are both filtered through `hiddenBooks` before building the final `books` array.

```js
function removeBook(id) {
  // Remove from manual list if it was manually added
  setManualBooks(prev => { const { [id]: _, ...next } = prev; saveManualBooks(next); return next })
  // Hide from Goodreads-matched list too
  setHiddenBooks(prev => { const next = new Set([...prev, id]); saveHiddenBooks(next); return next })
}
```

Hook return: adds `removeBook` to the exported object.

---

## `src/pages/CatalogPage.jsx` — full rewrite

### Feira API endpoint (proxied via Worker)

```
https://feiradolivrodelisboa.pt/_fll/wp-admin/admin-ajax.php/
  ?action=getSearchedBooks&invisuais=0&limit=50&offset=N
  &livros-do-dia=0|1
  [&search=QUERY]
```

Response: flat JSON array. No total count. Last page when `arr.length < LIMIT`.

### State

```js
const [inputVal, setInputVal]     = useState('')   // raw input
const [lddOnly, setLddOnly]       = useState(false)
const [offset, setOffset]         = useState(0)
const [results, setResults]       = useState([])   // accumulated (infinite scroll)
const [hasMore, setHasMore]       = useState(true)
const [fetching, setFetching]     = useState(false)
const [fetchError, setFetchError] = useState(null)
const query = useDebounce(inputVal, 300)            // 300ms debounce
```

### Reset on filter change

```js
useEffect(() => {
  setResults([]); setOffset(0); setHasMore(true); setFetchError(null)
}, [query, lddOnly])
```

### Fetch effect

Fires on `[query, lddOnly, offset]`. Uses `AbortController` + a `cancelled` ref to avoid stale updates.

- `offset === 0` → replace results (new search / filter)
- `offset > 0` → append results (next page via scroll)

```js
setResults(prev => offset === 0 ? arr : [...prev, ...arr])
```

### Infinite scroll

```js
const sentinelRef = useRef(null)   // 1px div at bottom of list
const fetchingRef = useRef(false)  // sync ref for IntersectionObserver callback

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => { if (entry.isIntersecting && !fetchingRef.current) setOffset(p => p + LIMIT) },
    { rootMargin: '300px' }
  )
  observer.observe(sentinelRef.current)
  return () => observer.disconnect()
}, [hasMore, results.length])
```

The `fetchingRef` (not state) prevents the observer callback from racing with an in-flight fetch. `rootMargin: '300px'` pre-loads the next batch before the user hits the bottom.

### Tab filters

Two tabs replacing the old count text:

```jsx
<button className={`shelf-tab ${!lddOnly ? 'active' : ''}`} onClick={() => setLddOnly(false)}>
  Todos <span className="shelf-tab__count">{fmtCount(TOTAL_ALL_BOOKS)}</span>
</button>
<button className={`shelf-tab ${lddOnly ? 'active' : ''}`} onClick={() => setLddOnly(true)}>
  Livros do Dia <span className="shelf-tab__count">{faireBooks ? fmtCount(Object.keys(faireBooks).length) : '…'}</span>
</button>
```

`TOTAL_ALL_BOOKS = 45234` (empirically determined 2026-05-24).

### Number formatting

```js
const fmtCount = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
```

Uses a regex instead of `toLocaleString('pt-PT')` because some browsers don't apply the thousands separator for 4-digit numbers in the `pt-PT` locale.

### LDD detection per result

```js
const isLdd = Boolean(faireBooks?.[normaliseIsbn(book.isbn)])
```

LDD status is derived from `faireBooks` — if the book's ISBN is a key in `faireBooks`, it's a livro do dia.

### Cover placeholder

`CatalogCard` tracks image load failure with `useState(false)`. If `!cover || imgError`, renders a `<div className="catalog-card__cover" />` instead of `<img>`. The CSS already has `width: 52px; height: 72px; background: #eee` on that class.

### End-of-list UI

- While loading next batch (scroll triggered): `"A carregar mais…"` inside the sentinel div
- After last page: `"— fim dos resultados —"`
- No results: `"Nenhum livro encontrado."`

---

## `src/pages/BooksPage.jsx` — LDD filter tab & savings fix

### New "Livro do Dia" shelf tab

Added to `SHELVES` array:
```js
{ key: 'ldd', label: 'Livro do Dia' }
```

Filter logic:
```js
if (shelf === 'ldd') return b.livroDodia
```

Count badge:
```js
s.key === 'ldd' ? books.filter(b => b.livroDodia).length : …
```

### Summary bar — savings calculation fix

Old code skipped non-LDD books entirely in savings, causing `totalSavings` to be too low.

New: savings = original price − what you actually pay, consistently for both types:
```js
const totalCost = wantedBooks.reduce((sum, b) =>
  sum + parseFloat(b.livroDodia ? b.feira_pvp_livro_do_dia : b.feira_pvp_feira)
, 0)
const totalSavings = wantedBooks.reduce((sum, b) =>
  sum + (parseFloat(b.feira_pvp) - parseFloat(b.livroDodia ? b.feira_pvp_livro_do_dia : b.feira_pvp_feira))
, 0)
```

`totalCost` and `totalSavings` are now mirror images: they use the same `paidPrice` expression so they're always consistent.

---

## Remove Book feature

### `src/components/TrashIcon.jsx` (new)

Inline SVG trash icon (Feather-style). Uses `stroke="currentColor"` and `width/height="1em"` so it inherits button colour and scales with font size.

### `src/components/ConfirmDialog.jsx` (new)

Portal-rendered confirmation modal. Renders into `document.body` via `createPortal` so it never clips inside overflow containers.

```jsx
export function ConfirmDialog({ message, confirmLabel = 'Remover', onConfirm, onCancel }) {
  return createPortal(
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__btn confirm-dialog__btn--cancel" onClick={onCancel}>Cancelar</button>
          <button className="confirm-dialog__btn confirm-dialog__btn--confirm" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

Clicking the backdrop (`confirm-overlay`) also cancels.

### Integration

| Component | Remove trigger | Dialog state |
|---|---|---|
| `BookCard` | "🗑 Remover" button | `useState(false)` in BookCard |
| `DaysPage > BookRow` | Trash icon (btn-sm) | `useState(false)` in BookRow |
| `MapPage > StandPopup` | Trash icon (btn-sm) per book | `useState(null)` (confirmingId) in StandPopup |

All three show the book title in the dialog message: `Remover "${book.feira_titulo}" da tua lista?`

### `App.jsx` wiring

`removeBook` destructured from `useBooks()` and passed as `onRemove` to `BooksPage`, `DaysPage`, and `MapPage`.

---

## CSS additions (`src/App.css`)

| Class | Purpose |
|---|---|
| `.btn-remove` | Muted colour; red border + text on hover |
| `.confirm-overlay` | Fixed full-screen backdrop, `rgba(0,0,0,0.45)`, `z-index: 10000` |
| `.confirm-dialog` | Centered card, `max-width: 300px`, `border-radius: 14px` |
| `.confirm-dialog__btn--confirm` | Red border/text, light red background |
| `.catalog-sentinel` | 1px invisible div at bottom of catalog list (IntersectionObserver target) |
