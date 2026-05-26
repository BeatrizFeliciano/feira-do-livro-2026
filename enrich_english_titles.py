#!/usr/bin/env python3
"""
Enrich app/public/all_feira_books.json with english_title from Open Library.

Two-step approach (sequential, no threading):

  Step 1 (~15 min): Batch-lookup 50 ISBNs at a time via
    /api/books?jscmd=details -> get work keys for found editions.

  Step 2 (~40 min): For each unique work key (deduplicated), fetch
    /works/{key}.json -> get canonical work title.
    Store as english_title when meaningfully different from Portuguese titulo.

Run from the project root:
    python enrich_english_titles.py

Re-run safe: already-enriched books are skipped (english_title present).
Work titles cached in .works_cache.json for safe resume.
"""

import json
import time
import unicodedata
import re
import sys
import os
from urllib.request import urlopen, Request
from urllib.error import HTTPError

_ROOT        = os.path.dirname(os.path.abspath(__file__))
BOOKS_PATH   = os.path.join(_ROOT, 'app', 'public', 'all_feira_books.json')
WORKS_CACHE  = os.path.join(_ROOT, '.works_cache.json')
OL_BOOKS_API = 'https://openlibrary.org/api/books'
OL_BASE      = 'https://openlibrary.org'
BATCH_SIZE   = 50
DELAY        = 1.1   # seconds between requests
SAVE_EVERY   = 200   # batches between intermediate saves (~every 10k ISBNs)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 FeiraBooksEnricher/1.0',
    'Accept': 'application/json',
}

def normalise(s):
    s = (s or '').lower()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()

def is_meaningfully_different(candidate, portuguese):
    na = normalise(candidate)
    nb = normalise(portuguese)
    if not na or na == nb:
        return False
    ta = set(na.split())
    tb = set(nb.split())
    if not ta:
        return False
    overlap = len(ta & tb) / max(len(ta), len(tb))
    return overlap < 0.80

def ol_get(url, retries=3):
    req = Request(url, headers=HEADERS)
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode('utf-8'))
        except HTTPError as e:
            if e.code == 429:
                wait = 15 * (attempt + 1)
                print(f'\n  Rate-limited (429) - waiting {wait}s...', file=sys.stderr, flush=True)
                time.sleep(wait)
            elif e.code in (404, 410):
                return None
            else:
                print(f'\n  HTTP {e.code} for {url}', file=sys.stderr, flush=True)
                if attempt == retries - 1:
                    return None
                time.sleep(3)
        except Exception as e:
            print(f'\n  Error ({type(e).__name__}): {e}', file=sys.stderr, flush=True)
            if attempt == retries - 1:
                return None
            time.sleep(3)
    return None

def fetch_editions_batch(isbns):
    """Fetch edition details for up to 50 ISBNs. Returns {isbn: work_key}."""
    bibkeys = ','.join(f'ISBN:{i}' for i in isbns)
    url = f'{OL_BOOKS_API}?bibkeys={bibkeys}&format=json&jscmd=details'
    data = ol_get(url)
    if not data:
        return {}
    out = {}
    for k, v in data.items():
        isbn = k.replace('ISBN:', '')
        details = v.get('details', {})
        works = details.get('works', [])
        if works:
            out[isbn] = works[0]['key']
    return out

def fetch_work_title(work_key, cache):
    """Fetch canonical title for a work key, using cache."""
    if work_key in cache:
        return cache[work_key]
    data = ol_get(f'{OL_BASE}{work_key}.json')
    title = (data or {}).get('title') or None
    cache[work_key] = title
    return title

def save(books, works_cache):
    with open(BOOKS_PATH, 'w', encoding='utf-8') as f:
        json.dump(books, f, ensure_ascii=False, separators=(',', ':'))
    with open(WORKS_CACHE, 'w', encoding='utf-8') as f:
        json.dump(works_cache, f, ensure_ascii=False, separators=(',', ':'))

def main():
    print(f'Loading {BOOKS_PATH}...')
    with open(BOOKS_PATH, encoding='utf-8') as f:
        books = json.load(f)
    total = len(books)
    print(f'{total:,} books loaded.')

    # Load works cache (allows safe resume)
    works_cache = {}
    if os.path.exists(WORKS_CACHE):
        with open(WORKS_CACHE, encoding='utf-8') as f:
            works_cache = json.load(f)
        print(f'Loaded {len(works_cache):,} cached work records.')

    to_process = [isbn for isbn, b in books.items() if not b.get('english_title')]
    already_done = total - len(to_process)
    if already_done:
        print(f'{already_done:,} already enriched - skipping.')
    print(f'\nStep 1: Edition batch lookup for {len(to_process):,} ISBNs '
          f'({len(to_process) // BATCH_SIZE + 1} batches x ~{DELAY}s each)')
    est1 = len(to_process) / BATCH_SIZE * DELAY / 60
    print(f'        Estimated: ~{est1:.0f} min\n')

    batches = [to_process[i:i + BATCH_SIZE] for i in range(0, len(to_process), BATCH_SIZE)]
    work_to_isbns = {}   # work_key -> [isbn, ...]
    step1_found = 0

    for i, batch in enumerate(batches):
        bnum = i + 1
        print(f'  Batch {bnum:4d}/{len(batches):4d}... ', end='', flush=True)
        result = fetch_editions_batch(batch)
        new = 0
        for isbn, wkey in result.items():
            work_to_isbns.setdefault(wkey, []).append(isbn)
            new += 1
        step1_found += new
        print(f'{new:2d} found  (total: {step1_found:,}, {len(work_to_isbns):,} unique works)')

        if bnum % SAVE_EVERY == 0:
            print('  -> Saving progress...', flush=True)
            save(books, works_cache)

        if i < len(batches) - 1:
            time.sleep(DELAY)

    print(f'\nStep 1 done: {step1_found:,} editions found, {len(work_to_isbns):,} unique works.')
    save(books, works_cache)

    # Step 2: work title lookup
    work_keys_todo = [k for k in work_to_isbns if k not in works_cache]
    est2 = len(work_keys_todo) * DELAY / 60
    print(f'\nStep 2: Work title lookup for {len(work_keys_todo):,} works '
          f'({len(works_cache):,} cached)')
    print(f'        Estimated: ~{est2:.0f} min\n')

    enriched = 0
    for i, wkey in enumerate(work_keys_todo):
        print(f'  Work {i+1:5d}/{len(work_keys_todo):5d} {wkey}... ', end='', flush=True)
        title = fetch_work_title(wkey, works_cache)

        if title:
            applied = 0
            for isbn in work_to_isbns[wkey]:
                titulo = books[isbn].get('titulo', '')
                if is_meaningfully_different(title, titulo):
                    books[isbn]['english_title'] = title
                    applied += 1
                    enriched += 1
            print(f'{title!r:50s} -> {applied} books')
        else:
            print('no title')

        if (i + 1) % SAVE_EVERY == 0:
            print('  -> Saving progress...', flush=True)
            save(books, works_cache)

        if i < len(work_keys_todo) - 1:
            time.sleep(DELAY)

    print('\nFinal save...')
    save(books, works_cache)

    enriched_total = sum(1 for b in books.values() if b.get('english_title'))
    print(f'\nDone! {enriched:,} new titles added.')
    print(f'Total enriched: {enriched_total:,} / {total:,} ({100 * enriched_total / total:.1f}%).')

    samples = [(b['titulo'], b['english_title']) for b in books.values() if b.get('english_title')][:20]
    if samples:
        print('\nSamples:')
        for pt, en in samples:
            print(f'  {pt!r:55s} -> {en!r}')

if __name__ == '__main__':
    main()
