# Feira do Livro — Map Tab & Enhancements

## Context

Additions built on top of the initial app (see `01-initial-app.md`). This document covers the Map tab, stand coordinate/publisher data files, and incremental improvements to the Books and Days pages.

---

## New Static Assets (`app/public/`)

### `stand-coordinates.json`
Maps every stand code (352 stands, A01–H58) to `{ x, y }` pixel coordinates within a 1600×2400 viewBox.

- Source: manual mapping based on the official SVG map layout
- X coordinates are **normalized** — all stands in a letter group share the same X value so they form clean vertical columns:

| Group | X |
|---|---|
| A | 378 |
| B | 471 |
| C | 523 |
| D | 601 |
| E | 1002 |
| F | 1095 |
| G | 1139 |
| H | 1223 |

- Y values are evenly spaced per group, derived from the stand number
- A45 has a manual Y adjustment (+17px) to avoid overlap with a neighboring element
- The official feira site uses a different coordinate system (860×1290 canvas) — that formula was tested but reverted in favour of the manual mapping

### `stand-publishers.json`
Maps every stand code to the publisher/editora name (352 entries).

- Source: `Mapa-e-Participantes_v0.pdf` → `pdftotext` → Python regex parser
- Multi-stand entries (e.g. `H44-H45-H46`) are split and each code gets its own entry
- Used by MapPage for popup publisher names and by the search index

### `mapa2026.svg`
Official feira map image (666 KB, viewBox `0 0 1600 2400`), downloaded from the feira website. Used as the background image for the Map tab.

---

## Map Tab (`src/pages/MapPage.jsx`)

### Layout
```
.map-page
  .map-controls          ← constrained to max-width 800px, centered
    .map-controls__row   ← day selector + search bar
    .map-legend          ← colour key (Quero comprar / Na lista / Comprado)
  .map-viewport          ← full-width, scrollable
    .map-inner           ← inline-block so overlay matches image size
      img.map-svg-img    ← SVG map, height: calc(100vh - 140px)
      .map-overlay       ← absolutely positioned, same size as image
        button.map-marker × N
      .map-popup-anchor  ← positioned at clicked marker
        StandPopup
```

### Stand markers
- Absolutely positioned `<button>` elements: `left: (x/1600)*100%`, `top: (y/2400)*100%`
- `transform: translate(-50%, -50%)` to center on the coordinate point
- `.map-overlay` uses `pointer-events: none`; markers re-enable pointer events individually
- Marker CSS classes:

| Class | Meaning |
|---|---|
| `map-marker--list` | Book on list, not yet flagged |
| `map-marker--want` | At least one book flagged "quero comprar" |
| `map-marker--bought` | At least one book marked bought |
| `map-marker--highlight` | Matches current search query |
| `map-marker--empty` | No books from list at this stand |

- Empty markers show no label; active/highlighted/selected markers show the stand code

### Day filter (`<select>`)
- Derives `allDays` from all discount dates across all books (ISO `YYYY-MM-DD`, sorted)
- Selecting a day filters `booksByStand` so marker colours and popup book lists both reflect only books discounted on that day
- Format: `27 maio`, `1 junho` (full Portuguese month names, lowercase)

### Search
Multi-target: stand code prefix (uppercase), publisher name substring (≥2 chars), book title/author substring (≥2 chars). Produces a `highlightSet` — matching stands get the amber highlight marker style.

### Popup (`StandPopup`)
- Opens anchored to the clicked marker's pixel position
- Shows publisher name (from `feira_participante` field or `stand-publishers.json` fallback)
- Lists books at the stand (filtered by active day if set)
- Each book has want/bought toggle buttons inline

### Alignment fix
`.map-viewport` uses `display: flex; justify-content: center` and `.map-inner` uses `display: inline-block` (not `min-width: 100%`) so markers and image are always co-located.

---

## Books Page Enhancements (`src/pages/BooksPage.jsx`)

### "Quero comprar" filter tab
Added as the second tab (after "Todos"), before the shelf tabs. Filters to `book.wantToBuy === true`. Count badge reflects live state.

### Extended search
`matches()` now checks four fields:
- `gr_title`
- `gr_author`
- `feira_participante` (editora)
- `feira_stand` (stand code)

Placeholder updated to: *"Pesquisar por título, autor, editora ou stand..."*

---

## Days Page Enhancements (`src/pages/DaysPage.jsx`)

### Day selector
A `<select className="map-day-select">` with the same style as the map's selector, placed to the left of the search bar in a `days-controls-row` flex container.

- Options derived from **all books** (not query-filtered) so all 19 days are always available
- Selecting a day shows only that day's section; "Todos os dias" shows all
- Short Portuguese format for option labels: `27 maio`, `1 junho`
- Full weekday format kept for section headers: `Quarta, 27 maio`

---

## CSS Notes (`src/App.css`)

- `.app-main--fullwidth` removes max-width for the map tab so the viewport fills the screen
- `.map-controls` is independently constrained to `max-width: 800px; margin: 0 auto` so the controls area matches the width of the other pages
- `.days-controls-row` mirrors `.map-controls__row`: flex row with the select fixed-width and the search bar flex-growing
- `.map-day-select`: shared class used by both MapPage and DaysPage selectors

---

## Design & Visual Identity (`src/assets/`)

### `logo.svg`
The initiative's logo (213×170 viewBox). Four stacked bands read top-to-bottom:
- **MY** — navy blue (`#2B4A95`)
- **2024** — dusky pink (`#DE929C`) with triple-chevron decoration
- **IN** — dark red (`#AE2A37`)
- **BOOKS** — forest green (`#517359`) with yellow text (`#F0DA89`)

Used in two places:
1. **Header** — 52px tall, wrapped in `.app-logo-btn` (clickable, navigates to About page)
2. **About page** — 140px wide, centered in the card

### `bg-pattern.svg`
Decorative book-spine pattern (495×366 viewBox, warm cream base `#FFF2E9`). Applied as a tiled body background at **5% opacity** via a `body::before` pseudo-element:

```css
body::before {
  background-image: url('./assets/bg-pattern.svg');
  background-size: 495px 366px;
  background-repeat: repeat;
  opacity: 0.05;
  position: fixed; inset: 0; z-index: 0;
}
```

`.app` has `position: relative; z-index: 1` to sit above the pseudo-element.

---

## About Page (`src/App.jsx` — `AboutPage` component)

Replaces the one-time landing page. Now a permanent page accessible at any time:

- **Default route** — app always opens here (`useState('about')`)
- **Logo click** — `.app-logo-btn` in the header navigates back to this page from anywhere
- **Content** — explains the app's purpose: cross-referencing Goodreads with feira livros do dia discounts, want/bought toggles, discount day calendar, map stand finder; closes with a note that only books in the livros do dia programme appear
- **CTA** — "Ver os meus livros →" navigates to the `books` tab

Layout: centered card (`max-width: 400px`, white with slight transparency and shadow) vertically centered in `calc(100vh - 72px)`. The book-spine pattern shows through at 5% opacity behind it.

---

## Books Page — Alphabetical Sort

Books are now sorted alphabetically by title (`localeCompare` with `'pt'` locale) instead of by shelf group. Applies across all filter tabs (Todos, Quero comprar, Para ler, etc.).
