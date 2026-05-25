"""
Generate app/public/all_feira_books.json from the live Feira do Livro API.
Fetches ALL books (~45k), keyed by normalised ISBN13.
Each entry includes livroDodia: true/false so the app needs no separate LDD file.

Run from the project root: python generate_all_feira_books.py
Requires: pip install requests
Duration: ~5–10 minutes (polite crawl + retries)

Resumable: progress is saved to all_feira_books_progress.json after every page.
If interrupted, re-running picks up from where it left off.
"""
import json, requests, time, html, sys, os

ENDPOINT    = 'https://feiradolivrodelisboa.pt/_fll/wp-admin/admin-ajax.php/'
LIMIT       = 100
MAX_RETRIES = 8          # skip offset after this many consecutive failures
PROGRESS    = 'all_feira_books_progress.json'
DST         = 'app/public/all_feira_books.json'

def normalize_isbn(isbn):
    digits = ''.join(c for c in (isbn or '') if c.isdigit())
    return digits[-13:] if len(digits) >= 13 else digits

u = lambda s: html.unescape(s or '')

def parse_book(b):
    return {
        'titulo':           u(b.get('titulo', '')),
        'autor':            u(b.get('autor', '')),
        'participante':     u(b.get('participante_name', '')),
        'stand':            b.get('stand', ''),
        'pvp':              b.get('pvp', '0'),
        'pvp_feira':        b.get('pvp_feira', '0'),
        'pvp_livro_do_dia': b.get('pvp_livro_do_dia') or None,
        'datas':            b.get('livro_do_dia_datas') or [],
        'cover':            b.get('cover_jpg') or b.get('cover_webp') or '',
        'livroDodia':       bool(b.get('pvp_livro_do_dia')),
    }

# ── Resume from progress file if it exists ───────────────────
books = {}
start_offset = 0
if os.path.exists(PROGRESS):
    with open(PROGRESS, encoding='utf-8') as f:
        saved = json.load(f)
    books        = saved['books']
    start_offset = saved['next_offset']
    print(f'Resuming from offset {start_offset} ({len(books)} books already saved)')

# ── Main fetch loop ───────────────────────────────────────────
offset = start_offset
while True:
    retries = 0
    batch   = None

    while retries < MAX_RETRIES:
        try:
            resp = requests.get(ENDPOINT, params={
                'action':        'getSearchedBooks',
                'invisuais':     '0',
                'livros-do-dia': '0',   # all books, not LDD-only
                'limit':         LIMIT,
                'offset':        offset,
            }, timeout=30)
            resp.raise_for_status()
            batch = resp.json()
            break   # success
        except Exception as e:
            retries += 1
            wait = min(5 * (2 ** (retries - 1)), 60)   # 5s, 10s, 20s, 40s, 60s, 60s…
            print(f'  Error at offset {offset} (attempt {retries}/{MAX_RETRIES}): {e}', file=sys.stderr)
            if retries < MAX_RETRIES:
                print(f'  Waiting {wait}s before retry…', file=sys.stderr)
                time.sleep(wait)

    if batch is None:
        # All retries exhausted — skip this offset and carry on
        print(f'  ⚠ Skipping offset {offset} after {MAX_RETRIES} failed attempts', file=sys.stderr)
        offset += LIMIT
        continue

    for b in batch:
        isbn = normalize_isbn(b.get('isbn', ''))
        if isbn:
            books[isbn] = parse_book(b)

    print(f'offset {offset:>6}: {len(batch):>3} books  (total so far: {len(books)})')

    # Save progress after every successful page
    with open(PROGRESS, 'w', encoding='utf-8') as f:
        json.dump({'next_offset': offset + LIMIT, 'books': books}, f,
                  ensure_ascii=False, separators=(',', ':'))

    if len(batch) < LIMIT:
        break   # last page

    offset += LIMIT
    time.sleep(0.3)   # slightly more polite to reduce 502s

# ── Write final output ────────────────────────────────────────
with open(DST, 'w', encoding='utf-8') as f:
    json.dump(books, f, ensure_ascii=False, separators=(',', ':'))

ldd_count = sum(1 for b in books.values() if b['livroDodia'])
print(f'\nDone: {len(books)} books written to {DST}')
print(f'  of which {ldd_count} are Livros do Dia')

# Clean up progress file on success
if os.path.exists(PROGRESS):
    os.remove(PROGRESS)
    print(f'Progress file removed.')
