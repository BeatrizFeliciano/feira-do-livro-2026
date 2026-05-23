#!/usr/bin/env python3
"""
Feira do Livro de Lisboa - Book Scraper
----------------------------------------
Fetches all books from the Feira do Livro Lisboa API and saves them to a CSV.

Requirements:
    pip install requests

Usage:
    # All books with livros-do-dia info (default):
    python feira_scraper.py

    # All books regardless of livros-do-dia:
    python feira_scraper.py --no-livros-do-dia

    # Custom output filename:
    python feira_scraper.py --output feira_books.csv

    # Adjust how many books are fetched per request (default 100):
    python feira_scraper.py --limit 50
"""

import argparse
import csv
import json
import time
from datetime import datetime

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_URL = "https://feiradolivrodelisboa.pt/_fll/wp-admin/admin-ajax.php/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

REQUEST_DELAY = 0.5  # seconds between requests

# All fields present in the API response
CSV_FIELDS = [
    "isbn",
    "titulo",
    "subtitulo",
    "autor",
    "chancela",
    "participante_name",
    "stand",
    "ano",
    "idioma",
    "dimensoes",
    "encadernacao",
    "paginas",
    "pvp",
    "pvp_feira",
    "pvp_livro_do_dia",
    "livro_do_dia_datas",
    "pvp_promocao",
    "promocao_datas",
    "invisuais_formato",
    "sinopse",
    "link_comprar",
    "cover_jpg",
    "cover_webp",
    "remote_id",
    "remote_last_update",
]

# ---------------------------------------------------------------------------
# Fetcher
# ---------------------------------------------------------------------------

def fetch_page(session: requests.Session, offset: int, limit: int, livros_do_dia: bool) -> list[dict]:
    params = {
        "action": "getSearchedBooks",
        "invisuais": "0",
        "limit": limit,
        "offset": offset,
    }
    if livros_do_dia:
        params["livros-do-dia"] = "1"

    resp = session.get(API_URL, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()

    data = resp.json()

    # API may return a list directly or wrap it
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("books") or data.get("data") or []
    return []


def fetch_all(limit: int = 100, livros_do_dia: bool = True) -> list[dict]:
    session = requests.Session()
    all_books = []
    offset = 0

    print(f"Fetching {'livros-do-dia' if livros_do_dia else 'all'} books (limit={limit} per page)…\n")

    while True:
        print(f"  offset={offset:>5} … ", end="", flush=True)
        books = fetch_page(session, offset, limit, livros_do_dia)

        if not books:
            print("no books returned — done.")
            break

        all_books.extend(books)
        print(f"{len(books)} books (total so far: {len(all_books)})")

        # If we got fewer than the limit, we've hit the last page
        if len(books) < limit:
            print("  Last page reached.")
            break

        offset += limit
        time.sleep(REQUEST_DELAY)

    return all_books


# ---------------------------------------------------------------------------
# Flatten & write CSV
# ---------------------------------------------------------------------------

def flatten_book(book: dict) -> dict:
    flat = {}
    for field in CSV_FIELDS:
        val = book.get(field, "")
        # livro_do_dia_datas is a list of date strings — join them
        if isinstance(val, list):
            val = ", ".join(str(v) for v in val)
        elif val is None:
            val = ""
        flat[field] = val
    return flat


def save_csv(books: list[dict], output: str):
    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for book in books:
            writer.writerow(flatten_book(book))
    print(f"\n✓ Saved {len(books)} books to '{output}'")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape Feira do Livro Lisboa API to CSV")
    parser.add_argument("--output", default="", help="Output CSV filename")
    parser.add_argument("--limit", type=int, default=100, help="Books per API request (default: 100)")
    parser.add_argument(
        "--no-livros-do-dia", action="store_true",
        help="Fetch all books instead of only livros-do-dia"
    )
    args = parser.parse_args()

    livros_do_dia = not args.no_livros_do_dia
    today = datetime.today().strftime("%Y%m%d")
    suffix = "livros_do_dia" if livros_do_dia else "all"
    output = args.output or f"feira_lisboa_{suffix}_{today}.csv"

    books = fetch_all(limit=args.limit, livros_do_dia=livros_do_dia)

    if not books:
        print("No books found. Check your connection or the API.")
        return

    save_csv(books, output)


if __name__ == "__main__":
    main()