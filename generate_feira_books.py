"""
Generate app/public/feira_books.json from the full feira catalogue.
Keyed by normalised ISBN13 for fast client-side lookup.
Run from the project root: python generate_feira_books.py
"""
import csv, json, re

def normalize_isbn(raw):
    return re.sub(r'\D', '', raw or '')

src = 'feira_lisboa_livros_do_dia_20260522.csv'
dst = 'app/public/feira_books.json'

books = {}
with open(src, encoding='utf-8') as f:
    for row in csv.DictReader(f):
        isbn = normalize_isbn(row['isbn'])
        if not isbn:
            continue
        datas = [d.strip() for d in row['livro_do_dia_datas'].split(',') if d.strip()]
        if not datas:
            continue  # skip books with no discount dates
        books[isbn] = {
            'titulo':           row['titulo'],
            'autor':            row['autor'],
            'participante':     row['participante_name'],
            'stand':            row['stand'],
            'pvp':              row['pvp'],
            'pvp_feira':        row['pvp_feira'],
            'pvp_livro_do_dia': row['pvp_livro_do_dia'],
            'datas':            datas,
            'cover':            row['cover_jpg'] or row['cover_webp'],
        }

with open(dst, 'w', encoding='utf-8') as f:
    json.dump(books, f, ensure_ascii=False, separators=(',', ':'))

print(f'Written {len(books)} books to {dst}')
