#!/usr/bin/env python3
"""
Goodreads Shelf Scraper
-----------------------
Scrapes your 'to-read' and 'read' shelves from a public Goodreads profile
and saves a rich CSV with as much metadata as possible.

Requirements:
    pip install requests beautifulsoup4 lxml

Usage:
    python goodreads_scraper.py --user YOUR_USER_ID_OR_URL
    python goodreads_scraper.py --user 12345678
    python goodreads_scraper.py --user https://www.goodreads.com/user/show/12345678
    python goodreads_scraper.py --user 12345678 --shelves to-read read currently-reading
    python goodreads_scraper.py --user 12345678 --output my_books.csv
"""

import argparse
import csv
import re
import sys
import time
from datetime import datetime

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Polite delay between page requests (seconds)
REQUEST_DELAY = 1.5

# Fields written to the CSV (in order)
CSV_FIELDS = [
    "shelf",
    "title",
    "author",
    "author_lf",           # Last, First format
    "additional_authors",
    "isbn",
    "isbn13",
    "asin",
    "year_published",
    "original_publication_year",
    "publisher",
    "binding",
    "number_of_pages",
    "average_rating",
    "number_of_ratings",
    "my_rating",
    "date_added",
    "date_read",
    "date_started",
    "read_count",
    "owned_copies",
    "my_review",
    "spoiler",
    "private_notes",
    "recommended_for",
    "recommended_by",
    "book_id",
    "book_url",
    "cover_url",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_user_id(raw: str) -> str:
    """Accept a numeric ID or a Goodreads profile/list URL."""
    raw = raw.strip()
    m = re.search(r"goodreads\.com/(?:user/show/|review/list/)(\d+)", raw)
    if m:
        return m.group(1)
    if re.fullmatch(r"\d+", raw):
        return raw
    sys.exit(f"[ERROR] Cannot parse user ID from: {raw!r}\n"
             "Expected a number or a URL like https://www.goodreads.com/user/show/12345678")


def get(url: str, session: requests.Session) -> BeautifulSoup:
    """Fetch a URL and return a BeautifulSoup object."""
    resp = session.get(url, headers=HEADERS, timeout=30)
    if "/user/sign_in" in resp.url or "/ap/signin" in resp.url:
        sys.exit(
            "[ERROR] Goodreads redirected to a sign-in page. "
            "Public shelf scraping appears to require authentication from this network/session."
        )
    if resp.status_code == 404:
        sys.exit("[ERROR] Profile not found (404). Check the user ID and make sure the shelf is public.")
    if resp.status_code == 403:
        sys.exit("[ERROR] Access denied (403). Goodreads may have rate-limited this IP, or the shelf is private.")
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "lxml")


def text(el) -> str:
    return el.get_text(strip=True) if el else ""


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------------------
# Per-book detail page (optional enrichment)
# ---------------------------------------------------------------------------

def scrape_book_detail(book_url: str, session: requests.Session) -> dict:
    """Fetch extra metadata from the individual book page."""
    extra = {}
    try:
        soup = get(book_url, session)
        time.sleep(REQUEST_DELAY)

        # Publisher / year from details block
        details = soup.find("div", id="details")
        if details:
            rows = details.find_all("div", class_="row")
            for row in rows:
                t = row.get_text(" ", strip=True)
                pub_m = re.search(r"Published\s+(?:\w+ \d+,?\s+)?(\d{4})\s+by\s+(.+?)(?:\s*\(|$)", t)
                if pub_m:
                    extra["year_published"] = pub_m.group(1)
                    extra["publisher"] = clean(pub_m.group(2))
                orig_m = re.search(r"first published\s+(?:\w+ \d+,?\s+)?(\d{4})", t, re.I)
                if orig_m:
                    extra["original_publication_year"] = orig_m.group(1)
                pages_m = re.search(r"(\d+)\s+pages", t)
                if pages_m:
                    extra["number_of_pages"] = pages_m.group(1)
                bind_m = re.search(r"(Hardcover|Paperback|Mass Market Paperback|Kindle Edition|ebook|Audiobook)", t, re.I)
                if bind_m:
                    extra["binding"] = bind_m.group(1)
                isbn_m = re.search(r"ISBN\s*(\d{10})", t)
                if isbn_m:
                    extra["isbn"] = isbn_m.group(1)
                isbn13_m = re.search(r"ISBN13?\s*:?\s*(97[89]\d{10})", t)
                if isbn13_m:
                    extra["isbn13"] = isbn13_m.group(1)
                asin_m = re.search(r"ASIN[:\s]+([A-Z0-9]{10})", t)
                if asin_m:
                    extra["asin"] = asin_m.group(1)

        # Rating count
        rc = soup.find("meta", itemprop="ratingCount")
        if rc:
            extra["number_of_ratings"] = rc.get("content", "")

    except Exception as e:
        print(f"  [warn] Could not fetch detail page {book_url}: {e}", file=sys.stderr)

    return extra


# ---------------------------------------------------------------------------
# Main shelf scraper
# ---------------------------------------------------------------------------

def scrape_shelf(user_id: str, shelf: str, session: requests.Session,
                 enrich: bool = True) -> list[dict]:
    """Scrape all pages of a shelf and return a list of book dicts."""
    books = []
    page = 1

    while True:
        url = (
            f"https://www.goodreads.com/review/list/{user_id}"
            f"?shelf={shelf}&per_page=100&page={page}"
            f"&sort=date_added&order=d&view=table"
        )
        print(f"  Fetching {shelf!r} page {page}…", end=" ", flush=True)
        soup = get(url, session)
        time.sleep(REQUEST_DELAY)

        rows = soup.select("tr.bookalike")
        if not rows:
            print("no rows found, done.")
            break

        print(f"{len(rows)} books")

        for row in rows:
            book = {"shelf": shelf}

            def cell(cls):
                td = row.find("td", class_=lambda c: c and cls in c.split())
                return text(td.find("span", class_="value") or td) if td else ""

            # Title & URL
            title_a = row.select_one("td.field.title a")
            book["title"] = clean(title_a["title"]) if title_a and title_a.get("title") else clean(cell("title"))
            book["book_url"] = ("https://www.goodreads.com" + title_a["href"].split("?")[0]) if title_a else ""
            book["book_id"] = re.search(r"/show/(\d+)", book["book_url"]).group(1) if book["book_url"] else ""

            # Author
            author_a = row.select_one("td.field.author a")
            book["author_lf"] = clean(text(author_a))
            # Convert "Last, First" → "First Last"
            if "," in book["author_lf"]:
                parts = [p.strip() for p in book["author_lf"].split(",", 1)]
                book["author"] = f"{parts[1]} {parts[0]}"
            else:
                book["author"] = book["author_lf"]

            book["additional_authors"] = cell("additional_authors")
            book["isbn"]              = cell("isbn").replace("=", "").replace('"', "")
            book["isbn13"]            = cell("isbn13").replace("=", "").replace('"', "")
            book["asin"]              = cell("asin")
            book["year_published"]    = cell("year_pub")
            book["original_publication_year"] = cell("orig_pub_year")
            book["publisher"]         = cell("publisher")
            book["binding"]           = cell("format")
            book["number_of_pages"]   = cell("num_pages")
            book["average_rating"]    = cell("avg_rating")
            book["number_of_ratings"] = cell("num_ratings")
            book["my_rating"]         = cell("rating").replace("did not like it","1").replace("it was ok","2").replace("liked it","3").replace("really liked it","4").replace("it was amazing","5")
            book["date_added"]        = cell("date_added")
            book["date_read"]         = cell("date_read")
            book["date_started"]      = cell("date_started") or cell("started_at")
            book["read_count"]        = cell("read_count")
            book["owned_copies"]      = cell("owned")
            book["recommended_for"]   = cell("recommended_for")
            book["recommended_by"]    = cell("recommended_by")
            book["spoiler"]           = ""
            book["private_notes"]     = cell("notes")
            book["my_review"]         = clean(cell("review"))

            # Cover image
            img = row.select_one("td.field.cover img")
            if img:
                src = img.get("src", "")
                # Get larger cover by adjusting the URL
                book["cover_url"] = re.sub(r"/_\w+(\d+x\d+)/", "/", src)
            else:
                book["cover_url"] = ""

            books.append(book)

        # Check for next page link
        if not soup.select_one("a[rel='next']"):
            break
        page += 1

    # Optional: enrich with detail pages for missing metadata
    if enrich:
        missing = [b for b in books if not b.get("isbn13") or not b.get("publisher")]
        if missing:
            print(f"  Enriching {len(missing)} books with detail pages…")
            for i, book in enumerate(missing, 1):
                if book.get("book_url"):
                    print(f"    [{i}/{len(missing)}] {book['title'][:60]}")
                    extra = scrape_book_detail(book["book_url"], session)
                    for k, v in extra.items():
                        if not book.get(k):
                            book[k] = v

    return books


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape Goodreads shelves to CSV")
    parser.add_argument("--user", required=True, help="Goodreads user ID or profile URL")
    parser.add_argument(
        "--shelves", nargs="+", default=["to-read", "read"],
        help="Shelf names to scrape (default: to-read read)"
    )
    parser.add_argument("--output", default="", help="Output CSV filename (default: goodreads_<user>_<date>.csv)")
    parser.add_argument(
        "--no-enrich", action="store_true",
        help="Skip fetching individual book pages (faster, less metadata)"
    )
    args = parser.parse_args()

    user_id = extract_user_id(args.user)
    output = args.output or f"goodreads_{user_id}_{datetime.today().strftime('%Y%m%d')}.csv"

    print(f"User ID  : {user_id}")
    print(f"Shelves  : {', '.join(args.shelves)}")
    print(f"Output   : {output}")
    print(f"Enrich   : {not args.no_enrich}")
    print()

    session = requests.Session()
    all_books = []

    for shelf in args.shelves:
        print(f"── Shelf: {shelf} ──")
        books = scrape_shelf(user_id, shelf, session, enrich=not args.no_enrich)
        all_books.extend(books)
        print(f"  → {len(books)} books scraped\n")

    if not all_books:
        print("No books found. Make sure the shelves are public.")
        sys.exit(1)

    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_books)

    print(f"✓ Saved {len(all_books)} books to {output!r}")


if __name__ == "__main__":
    main()