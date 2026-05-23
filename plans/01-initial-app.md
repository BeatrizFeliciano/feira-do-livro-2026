# Feira do Livro Explorer — Implementation Plan

## Context

Build a static React web app to cross-reference a Goodreads library export with Lisbon's Feira do Livro "livro do dia" discounts. 55 matched books, 19 days of discounts (May 27–June 14 2026). All data comes from a pre-built CSV (`matched_books.csv`). State (want-to-buy / bought) lives in localStorage. Deploy to GitHub Pages.

---

## Data Model

**Source:** `public/matched_books.csv` (55 rows)

Key fields used:
| Field | Use |
|---|---|
| `feira_isbn` | Unique ID for each book |
| `gr_title`, `gr_author` | Display title/author |
| `gr_shelf` | `to-read`, `read`, `currently-reading`, `did-not-finish` |
| `gr_my_rating` | 0–5 stars |
| `feira_pvp`, `feira_pvp_feira`, `feira_pvp_livro_do_dia` | 3-tier price |
| `feira_livro_do_dia_datas` | Comma-separated discount dates |
| `feira_stand` | Stand code (e.g. `H28`, `E18`) |
| `feira_participante` | Publisher/stand name |
| `feira_cover_jpg` | Book cover URL |
| `match_method` | `isbn`, `fuzzy`, `possible_match`, `author_match` |

**localStorage shape:**
```json
{
  "9789896661762": { "wantToBuy": true, "bought": false }
}
```

---

## File Structure

```
feira-do-livro/
  plans/                          # dev docs, not served by the app
    01-initial-app.md             # this plan (copy here on implementation start)
  app/
    public/
      matched_books.csv
    src/
      main.jsx              # entry point (exists, keep)
      index.css             # reset + CSS variables (rewrite)
      App.jsx               # root: tab nav + data loading
      App.css               # layout styles
      hooks/
        useBooks.js         # CSV parse, localStorage read/write
      pages/
        BooksPage.jsx       # books list with shelf filter
        DaysPage.jsx        # days timeline grouped by stand
      components/
        BookCard.jsx        # book card with want/bought toggles
        ShelfBadge.jsx      # colored pill label for shelf
```

---

## Implementation

### `hooks/useBooks.js`
- On mount: `fetch('/matched_books.csv')` → parse with PapaParse
- Read localStorage key `feira_book_state` (object keyed by isbn)
- Expose:
  - `books` — parsed rows merged with localStorage state
  - `toggleWant(isbn)` — flips `wantToBuy`; if setting to false, also clears `bought`
  - `toggleBought(isbn)` — flips `bought`; auto-sets `wantToBuy: true` when marking bought

### `App.jsx`
- Loads books via `useBooks`
- Two tabs: **Books** | **Days**
- Passes `books`, `toggleWant`, `toggleBought` to both pages

### `BooksPage.jsx`
- Shelf filter tabs: **All** | **To Read** (26) | **Read** (27) | **Currently Reading** (1) | **Did Not Finish** (1)
- Summary bar at top (only when filters include to-read or all): total potential savings if you bought all "want to buy" books at livro do dia price
- Books displayed as horizontal cards:
  - Cover image (left, ~80px)
  - Title + author (bold/muted)
  - Shelf badge (color-coded)
  - Rating stars if `gr_my_rating > 0`
  - Price block: `PVP €X.XX → Feira €X.XX → Dia €X.XX` with savings % in green
  - Stand + participante (small, muted)
  - **"Want to buy"** toggle button + **"Bought"** toggle button (right side)
  - Small indicator if `match_method` is fuzzy/possible (shows a `~` or `?` badge so you know the match isn't perfect)

### `DaysPage.jsx`
- Filter at top: **All books** | **Want to buy** | **Not yet bought**
- Each day renders as a section:
  - Header: weekday + date (e.g. "Sábado, 4 Jun") + count badge (total books / want-to-buy count)
  - Best day badge: whichever day has the most "want to buy" books gets a ★ indicator
  - Within each day: books grouped by stand, stand shown as a sub-header
  - Each book row: tiny cover, title, `€X.XX` (livro do dia price), shelf badge, want/bought toggles
- Days with 0 matching books (after filter) are hidden

### Styling
- Plain CSS with custom properties — no Tailwind, no external UI lib
- Light mode default (easier to use at the feira on a phone)
- Color palette: warm white background, green accent for "want to buy" / savings, muted grey for secondary info
- Mobile-first (single column, tappable buttons ≥ 44px)

### GitHub Pages deploy
- `vite.config.js`: add `base: '/feira-do-livro/'` (adjust to match repo name)
- Add to `package.json` scripts: `"deploy": "npm run build && npx gh-pages -d dist"`
- Install `gh-pages` as dev dependency

---

## Shelf badge colors
| Shelf | Color |
|---|---|
| to-read | Blue |
| read | Green |
| currently-reading | Orange |
| did-not-finish | Grey |

---

## Verification
1. `npm run dev` → open localhost → both tabs render, all 55 books show
2. Toggle want/bought on a book → persists on page refresh (localStorage)
3. Books tab shelf filter → correct counts (to-read: 26, read: 27)
4. Days tab → June 14 shows 17 books, June 4 shows 16
5. Days tab "want to buy" filter → only shows days with at least one wanted book
6. Best day indicator moves as you toggle books
7. `npm run build` → no errors → `dist/` folder generated
