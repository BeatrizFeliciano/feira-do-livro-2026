#!/usr/bin/env python3
"""
Goodreads × Feira do Livro Lisboa — Matcher
--------------------------------------------
Combines your Goodreads library with the Feira do Livro Lisboa catalogue.
Only books present in your Goodreads lists are kept.

Matching strategy (in order):
  1. ISBN match (ISBN13 or ISBN10)
  2. Fuzzy title + author match
  3. Author-based match — filters feira by author name, then fuzzy matches
     on title only with a lower threshold. Handles translated titles where
     the author name is still recognisable.

Requirements:
    pip install rapidfuzz

Usage:
    python match_goodreads_feira.py \
        --goodreads goodreads_library_export.csv \
        --feira feira_lisboa_livros_do_dia_20260522.csv \
        --output matched_books.csv

    # Adjust fuzzy match threshold (0-100, default 72):
    python match_goodreads_feira.py --fuzzy-threshold 80 ...
"""

import argparse
import csv
import re
import unicodedata

from rapidfuzz import fuzz

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

FUZZY_THRESHOLD = 72   # minimum score (0–100) for title+author fuzzy match

GR_FIELDS = [
    "gr_shelf", "gr_title", "gr_author", "gr_isbn", "gr_isbn13",
    "gr_my_rating", "gr_publisher", "gr_binding", "gr_pages",
    "gr_year_published", "gr_original_year", "gr_date_read",
    "gr_date_added", "gr_bookshelves", "gr_my_review",
    "gr_read_count", "gr_book_id",
]
FEIRA_FIELDS = [
    "feira_titulo", "feira_subtitulo", "feira_autor", "feira_isbn",
    "feira_chancela", "feira_participante", "feira_stand",
    "feira_pvp", "feira_pvp_feira", "feira_pvp_livro_do_dia",
    "feira_livro_do_dia_datas", "feira_cover_jpg", "feira_cover_webp",
]
META_FIELDS = ["match_method", "match_score"]
OUTPUT_FIELDS = META_FIELDS + GR_FIELDS + FEIRA_FIELDS

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalise(s: str) -> str:
    s = s.lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clean_isbn(raw: str) -> str:
    return re.sub(r"[^0-9X]", "", raw.upper())


def load_goodreads(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    books = []
    for r in rows:
        books.append({
            "gr_shelf":          r.get("Exclusive Shelf", ""),
            "gr_title":          r.get("Title", "").strip(),
            "gr_author":         r.get("Author", "").strip(),
            "gr_isbn":           clean_isbn(r.get("ISBN", "")),
            "gr_isbn13":         clean_isbn(r.get("ISBN13", "")),
            "gr_my_rating":      r.get("My Rating", ""),
            "gr_publisher":      r.get("Publisher", ""),
            "gr_binding":        r.get("Binding", ""),
            "gr_pages":          r.get("Number of Pages", ""),
            "gr_year_published": r.get("Year Published", ""),
            "gr_original_year":  r.get("Original Publication Year", ""),
            "gr_date_read":      r.get("Date Read", ""),
            "gr_date_added":     r.get("Date Added", ""),
            "gr_bookshelves":    r.get("Bookshelves", "") or r.get("Exclusive Shelf", ""),
            "gr_my_review":      r.get("My Review", ""),
            "gr_read_count":     r.get("Read Count", ""),
            "gr_book_id":        r.get("Book Id", ""),
        })
    return books


def load_feira(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    books = []
    for r in rows:
        books.append({
            "feira_titulo":           r.get("titulo", "").strip(),
            "feira_subtitulo":        r.get("subtitulo", "").strip(),
            "feira_autor":            r.get("autor", "").strip(),
            "feira_isbn":             clean_isbn(r.get("isbn", "")),
            "feira_chancela":         r.get("chancela", ""),
            "feira_participante":     r.get("participante_name", ""),
            "feira_stand":            r.get("stand", ""),
            "feira_pvp":              r.get("pvp", ""),
            "feira_pvp_feira":        r.get("pvp_feira", ""),
            "feira_pvp_livro_do_dia": r.get("pvp_livro_do_dia", ""),
            "feira_livro_do_dia_datas": r.get("livro_do_dia_datas", ""),
            "feira_cover_jpg":        r.get("cover_jpg", ""),
            "feira_cover_webp":       r.get("cover_webp", ""),
        })
    return books


def fazer_linha(gr: dict, feira: dict, method: str, score: str) -> dict:
    row = {"match_method": method, "match_score": score}
    row.update(gr)
    row.update(feira)
    return row

# ---------------------------------------------------------------------------
# Step 1: ISBN matching
# ---------------------------------------------------------------------------

def match_by_isbn(gr_books, feira_books):
    feira_by_isbn = {}
    for fb in feira_books:
        isbn = fb["feira_isbn"]
        if isbn and len(isbn) >= 10:
            feira_by_isbn[isbn] = fb
            feira_by_isbn[isbn[-10:]] = fb

    matched = []
    unmatched_gr = []
    matched_feira_isbns = set()

    for gb in gr_books:
        found = None
        for isbn_key in ("gr_isbn13", "gr_isbn"):
            val = gb[isbn_key]
            if val and len(val) >= 10:
                if val in feira_by_isbn:
                    found = feira_by_isbn[val]
                    break
                if val[-10:] in feira_by_isbn:
                    found = feira_by_isbn[val[-10:]]
                    break
        if found:
            matched.append(fazer_linha(gb, found, "isbn", "100"))
            matched_feira_isbns.add(found["feira_isbn"])
        else:
            unmatched_gr.append(gb)

    unmatched_feira = [fb for fb in feira_books if fb["feira_isbn"] not in matched_feira_isbns]
    return matched, unmatched_gr, unmatched_feira

# ---------------------------------------------------------------------------
# Step 2: Fuzzy title + author matching
# ---------------------------------------------------------------------------

def fuzzy_score(gr, fb):
    t_score = fuzz.token_sort_ratio(normalise(gr["gr_title"]), normalise(fb["feira_titulo"]))
    gr_author_last  = normalise(gr["gr_author"]).split()[-1] if gr["gr_author"] else ""
    fb_author_words = normalise(fb["feira_autor"]).split()
    a_score = max((fuzz.ratio(gr_author_last, w) for w in fb_author_words), default=0) if gr_author_last else 0
    return t_score * 0.75 + a_score * 0.25


def match_by_fuzzy(gr_books, feira_books, threshold):
    matched = []
    unmatched_gr = []
    matched_feira_isbns = set()

    for gb in gr_books:
        best_score = 0
        best_fb = None
        for fb in feira_books:
            score = fuzzy_score(gb, fb)
            if score > best_score:
                best_score = score
                best_fb = fb
        if best_score >= threshold and best_fb:
            matched.append(fazer_linha(gb, best_fb, "fuzzy", f"{best_score:.1f}"))
            matched_feira_isbns.add(best_fb["feira_isbn"])
        else:
            unmatched_gr.append(gb)

    unmatched_feira = [fb for fb in feira_books if fb["feira_isbn"] not in matched_feira_isbns]
    return matched, unmatched_gr, unmatched_feira

# ---------------------------------------------------------------------------
# Step 3: Author-based matching — filter feira by author, fuzzy match title
# ---------------------------------------------------------------------------

def author_exact_match(gr_author: str, feira_autor: str) -> bool:
    """
    Exact match after normalisation (removes accents, punctuation, lowercases).
    Also handles 'Lastname, Firstname' vs 'Firstname Lastname' by using
    token_sort_ratio at 100 — word order doesn't matter.
    """
    return fuzz.token_sort_ratio(normalise(gr_author), normalise(feira_autor)) == 100


def title_only_score(gr_title: str, feira_titulo: str) -> float:
    """Fuzzy score based only on title, ignoring author."""
    return fuzz.token_sort_ratio(normalise(gr_title), normalise(feira_titulo))


def match_by_author(gr_books, feira_books, threshold):
    """
    For each unmatched GR book, find all feira books with an exact author match,
    then pick the best title match. Since the author is confirmed exact, we can
    be very permissive with the title threshold (handles translated titles).

    Threshold logic:
    - 1 candidate  → match directly (only one book by this author at the feira)
    - 2-3 candidates → threshold 35
    - 4+ candidates → threshold 50
    """
    def clean_title(t):
        return re.sub(r"\s*\(.*?\)\s*$", "", t).strip()

    matched = []
    unmatched_gr = []
    matched_feira_isbns = set()

    for gb in gr_books:
        candidates = [fb for fb in feira_books if author_exact_match(gb["gr_author"], fb["feira_autor"])]

        if not candidates:
            unmatched_gr.append(gb)
            continue

        gr_t = clean_title(gb["gr_title"])
        best_score = 0
        best_fb = None

        for fb in candidates:
            score = title_only_score(gr_t, fb["feira_titulo"])
            if score > best_score:
                best_score = score
                best_fb = fb

        n = len(candidates)
        if n == 1:
            # Single candidate: match if title has some similarity (likely translation)
            # or flag as "possible" if titles are very different (may be wrong book)
            if best_score >= 45:
                method = "author_match"
            elif best_score >= 20:
                method = "possible_match"  # author confirmed, but title very different — verify manually
            else:
                unmatched_gr.append(gb)
                continue
            matched.append(fazer_linha(gb, best_fb, method, f"{best_score:.1f}"))
            matched_feira_isbns.add(best_fb["feira_isbn"])
        elif n <= 3:
            if best_score >= 55:
                matched.append(fazer_linha(gb, best_fb, "author_match", f"{best_score:.1f}"))
                matched_feira_isbns.add(best_fb["feira_isbn"])
            else:
                unmatched_gr.append(gb)
        else:
            if best_score >= 65:
                matched.append(fazer_linha(gb, best_fb, "author_match", f"{best_score:.1f}"))
                matched_feira_isbns.add(best_fb["feira_isbn"])
            else:
                unmatched_gr.append(gb)

    unmatched_feira = [fb for fb in feira_books if fb["feira_isbn"] not in matched_feira_isbns]
    return matched, unmatched_gr, unmatched_feira


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Match Goodreads library against Feira do Livro Lisboa")
    parser.add_argument("--goodreads",       default="goodreads_library_export.csv")
    parser.add_argument("--feira",           default="feira_lisboa_livros_do_dia_20260522.csv")
    parser.add_argument("--output",          default="matched_books.csv")
    parser.add_argument("--fuzzy-threshold", type=int, default=FUZZY_THRESHOLD)
    args = parser.parse_args()

    print(f"Loading Goodreads: {args.goodreads}")
    gr_books = load_goodreads(args.goodreads)
    print(f"  {len(gr_books)} books\n")

    print(f"Loading Feira: {args.feira}")
    feira_books = load_feira(args.feira)
    print(f"  {len(feira_books)} books\n")

    all_matched = []

    print("── Step 1: ISBN matching ──")
    matched, gr_books, feira_books = match_by_isbn(gr_books, feira_books)
    all_matched.extend(matched)
    print(f"  Matched: {len(matched)} | Remaining GR: {len(gr_books)} | Remaining Feira: {len(feira_books)}\n")

    print(f"── Step 2: Fuzzy title + author matching (threshold={args.fuzzy_threshold}) ──")
    matched, gr_books, feira_books = match_by_fuzzy(gr_books, feira_books, args.fuzzy_threshold)
    all_matched.extend(matched)
    print(f"  Matched: {len(matched)} | Remaining GR: {len(gr_books)} | Remaining Feira: {len(feira_books)}\n")

    if gr_books:
        print(f"── Step 3: Author-based matching ({len(gr_books)} GR books remaining) ──")
        matched, gr_books, feira_books = match_by_author(gr_books, feira_books, args.fuzzy_threshold)
        all_matched.extend(matched)
        print(f"  Matched: {len(matched)} | Remaining GR: {len(gr_books)} | Remaining Feira: {len(feira_books)}\n")

    # Deduplicate: if two GR books matched the same feira ISBN, keep the best one.
    # Priority: isbn > fuzzy/author_match (by score desc) > possible_match
    METHOD_PRIORITY = {"isbn": 0, "fuzzy": 1, "author_match": 2, "possible_match": 3}

    def best_match(matches):
        return min(matches, key=lambda r: (METHOD_PRIORITY.get(r["match_method"], 99), -float(r["match_score"])))

    by_feira_isbn = {}
    for row in all_matched:
        by_feira_isbn.setdefault(row["feira_isbn"], []).append(row)

    deduped = []
    duplicates_found = False
    for isbn, matches in by_feira_isbn.items():
        if len(matches) > 1:
            duplicates_found = True
            winner = best_match(matches)
            losers = [r["gr_title"] for r in matches if r is not winner]
            print(f"  ⚠ Duplicate feira ISBN {isbn}:")
            print(f"      keeping : '{winner['gr_title']}' ({winner['match_method']}, score {winner['match_score']})")
            for t in losers:
                print(f"      dropping: '{t}'")
            deduped.append(winner)
        else:
            deduped.append(matches[0])

    if not duplicates_found:
        print("  No duplicate feira ISBNs.")
    all_matched = deduped

    print(f"── Summary ──")
    print(f"  Total matches: {len(all_matched)}")
    if all_matched:
        from collections import Counter
        by_method = Counter(r["match_method"] for r in all_matched)
        for method, count in by_method.items():
            print(f"    {method}: {count}")

    if not all_matched:
        print("No matches found.")
        return

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_matched)

    print(f"\n✓ Saved to '{args.output}'")


if __name__ == "__main__":
    main()