import { useState, useEffect } from 'react'
import * as fuzz from 'fuzzball'

import { WORKER_URL } from '../constants'

const SHELVES       = ['to-read', 'read', 'currently-reading', 'did-not-finish']
const FUZZY_THRESHOLD = 72   // same default as the Python script

const LS_STATE_KEY  = 'feira_book_state'
const LS_USER_KEY   = 'feira_goodreads_id'
const LS_CACHE_KEY  = 'feira_books_cache'
const LS_MANUAL_KEY  = 'feira_manual_books'   // { [isbn]: fullBookObj }
const LS_HIDDEN_KEY  = 'feira_hidden_books'   // [isbn, ...]

// ── Exact port of Python's normalise() ───────────────────
// Matches: unicodedata.normalize('NFD') + strip Mn + lower + non-alnum→space + collapse ws
function normalise(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')        // strip combining / accent characters (category Mn)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Exact port of Python's fuzzy_score() ─────────────────
// score = token_sort_ratio(title) * 0.75 + max(ratio(author_last, word)) * 0.25
function fuzzyScore(gr, fb) {
  const tScore = fuzz.token_sort_ratio(normalise(gr.title), normalise(fb.titulo), { full_process: false })
  const grAuthorLast = normalise(gr.author || '').split(' ').filter(Boolean).pop() || ''
  const fbAuthorWords = normalise(fb.autor || '').split(' ').filter(Boolean)
  let aScore = 0
  if (grAuthorLast && fbAuthorWords.length > 0) {
    aScore = Math.max(...fbAuthorWords.map(w => fuzz.ratio(grAuthorLast, w, { full_process: false })))
  }
  return tScore * 0.75 + aScore * 0.25
}

// ── Exact port of Python's author_exact_match() ──────────
// token_sort_ratio == 100 after normalisation
function authorExactMatch(grAuthor, faireAutor) {
  return fuzz.token_sort_ratio(normalise(grAuthor), normalise(faireAutor), { full_process: false }) === 100
}

// ── Exact port of Python's title_only_score() ────────────
function titleOnlyScore(grTitle, faireTitle) {
  return fuzz.token_sort_ratio(normalise(grTitle), normalise(faireTitle), { full_process: false })
}

// ── Exact port of Python's clean_title() ─────────────────
// Removes trailing parenthetical, e.g. "Dune (Dune, #1)" → "Dune"
function cleanTitle(t) {
  return (t || '').replace(/\s*\(.*?\)\s*$/, '').trim()
}

// ── Index helpers ─────────────────────────────────────────

// Inverted index: normalised title word (len≥3) OR author word (len≥2) → [isbn, ...]
// Combined so that step 2 finds candidates even when titles are translated
// (different words) but the author word still matches.
function buildTitleAuthorWordIndex(faireBooks) {
  const index = new Map()
  const add = (word, isbn) => {
    if (!index.has(word)) index.set(word, [])
    index.get(word).push(isbn)
  }
  for (const [isbn, book] of Object.entries(faireBooks)) {
    for (const w of normalise(book.titulo).split(' ').filter(w => w.length >= 3)) add(w, isbn)
    for (const w of normalise(book.autor || '').split(' ').filter(w => w.length >= 2)) add(w, isbn)
  }
  return index
}

// Inverted index: every normalised word of the author name → [{isbn, ...book}]
// Keying on ALL words (not just last) handles "Rooney, Sally" → last word is
// "sally" after normalisation, but GR has "rooney" as the last name.
function buildAuthorWordIndex(faireBooks) {
  const index = new Map()
  for (const [isbn, book] of Object.entries(faireBooks)) {
    for (const w of normalise(book.autor || '').split(' ').filter(w => w.length >= 2)) {
      if (!index.has(w)) index.set(w, [])
      index.get(w).push({ isbn, ...book })
    }
  }
  return index
}

// ── RSS helpers ───────────────────────────────────────────

function normalizeIsbn(raw) { return (raw || '').replace(/\D/g, '') }

function parseShelfRSS(xml, shelf) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  return Array.from(doc.querySelectorAll('item')).map(item => ({
    isbn13: normalizeIsbn(item.querySelector('isbn13')?.textContent),
    isbn:   normalizeIsbn(item.querySelector('isbn')?.textContent),
    title:  item.querySelector('title')?.textContent?.trim(),
    author: item.querySelector('author_name')?.textContent?.trim(),
    shelf,
    rating: parseInt(item.querySelector('user_rating')?.textContent?.trim() || '0'),
  }))
}

// ── createMatch ───────────────────────────────────────────
function createMatch(gr, isbn, fb) {
  return {
    id:                     isbn,
    gr_title:               gr.title,
    gr_author:              gr.author,
    gr_shelf:               gr.shelf,
    gr_my_rating:           gr.rating,
    feira_titulo:           fb.titulo,
    feira_autor:            fb.autor,
    feira_participante:     fb.participante,
    feira_stand:            fb.stand,
    feira_pvp:              fb.pvp,
    feira_pvp_feira:        fb.pvp_feira,
    feira_pvp_livro_do_dia: fb.pvp_livro_do_dia,
    discountDates:          fb.datas,
    livroDodia:             fb.livroDodia ?? true,
    feira_cover_jpg:        fb.cover,
  }
}

// Yield to the browser so React can re-render and show the updated progress message
const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0))

// ── Core matching: 3-step port of match_goodreads_feira.py ─

async function fetchAndMatch(userId, faireBooks, onProgress, signal) {

  // Pre-build indices (done once, before any comparisons)
  const titleAuthorWordIndex = buildTitleAuthorWordIndex(faireBooks)
  const authorWordIndex      = buildAuthorWordIndex(faireBooks)

  // ── Fetch all Goodreads shelves ────────────────────────
  const allGrBooks = []
  const seenGr = new Set()   // deduplicate books appearing in multiple shelves

  for (let i = 0; i < SHELVES.length; i++) {
    const shelf = SHELVES[i]
    onProgress(`A carregar livros do Goodreads… (${i + 1}/${SHELVES.length})`)
    const target  = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${encodeURIComponent(shelf)}&per_page=200`
    const proxyUrl = `${WORKER_URL}?url=${encodeURIComponent(target)}`
    try {
      const res = await fetch(proxyUrl, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      for (const book of parseShelfRSS(await res.text(), shelf)) {
        const key = book.isbn13 || book.isbn || book.title
        if (key && !seenGr.has(key)) { seenGr.add(key); allGrBooks.push(book) }
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e
      console.warn(`Shelf "${shelf}" failed:`, e.message)
    }
  }

  const seenFaire = new Set()   // track matched faire ISBNs (no double-matching)
  const matched   = []

  // ── Step 1: ISBN matching ──────────────────────────────
  // Exact port of match_by_isbn(): try gr_isbn13 then gr_isbn, also the last-10 digits
  onProgress('A cruzar os teus livros com a feira — passo 1 de 3: ISBN…')
  await yieldToUI()
  const afterStep1 = []

  for (const gr of allGrBooks) {
    let found = null
    for (const isbn of [gr.isbn13, gr.isbn]) {
      if (!isbn || isbn.length < 10) continue
      if (faireBooks[isbn] && !seenFaire.has(isbn)) { found = { isbn, ...faireBooks[isbn] }; break }
      const last10 = isbn.slice(-10)
      const hit = Object.keys(faireBooks).find(k => k.endsWith(last10) && !seenFaire.has(k))
      if (hit) { found = { isbn: hit, ...faireBooks[hit] }; break }
    }
    if (found) { seenFaire.add(found.isbn); matched.push(createMatch(gr, found.isbn, found)) }
    else afterStep1.push(gr)
  }

  // ── Step 2: Fuzzy title + author matching ─────────────
  // Exact port of match_by_fuzzy().
  // Pre-filter via title-word index to avoid O(n×m) full scan;
  // the index only misses pairs with zero shared words (handled by step 3).
  onProgress('A cruzar os teus livros com a feira — passo 2 de 3: título e autor…')
  await yieldToUI()
  const afterStep2 = []

  for (const gr of afterStep1) {
    // Candidates: faire books sharing ≥1 title word (len≥3) OR author word (len≥2)
    const candidateIsbns = new Set()
    const grWords = [
      ...normalise(gr.title  || '').split(' ').filter(w => w.length >= 3),
      ...normalise(gr.author || '').split(' ').filter(w => w.length >= 2),
    ]
    for (const word of grWords) {
      for (const isbn of (titleAuthorWordIndex.get(word) || [])) {
        if (!seenFaire.has(isbn)) candidateIsbns.add(isbn)
      }
    }

    let bestScore = 0, bestFb = null
    for (const isbn of candidateIsbns) {
      const score = fuzzyScore(gr, { ...faireBooks[isbn] })
      if (score > bestScore) { bestScore = score; bestFb = { isbn, ...faireBooks[isbn] } }
    }

    if (bestScore >= FUZZY_THRESHOLD && bestFb) {
      console.log(`[step2] "${gr.title}" → "${bestFb.titulo}" (score ${bestScore.toFixed(1)})`)
      seenFaire.add(bestFb.isbn)
      matched.push(createMatch(gr, bestFb.isbn, bestFb))
    } else {
      afterStep2.push(gr)
    }
  }

  // ── Step 3: Author-based matching ─────────────────────
  // Exact port of match_by_author().
  // Uses pre-built author-last-name index, then verifies with authorExactMatch().
  onProgress('A cruzar os teus livros com a feira — passo 3 de 3: autor…')
  await yieldToUI()

  for (const gr of afterStep2) {
    // Gather faire books that share ANY author word, then filter by exact match.
    // Using all words (not just last) handles "Rooney, Sally" stored in the
    // faire vs "Sally Rooney" in GR — the comma is normalised away, so the
    // last word becomes "sally" not "rooney"; looking up all words finds both.
    const grAuthorWords = normalise(gr.author || '').split(' ').filter(w => w.length >= 2)
    if (!grAuthorWords.length) continue

    const candidateIsbns = new Set()
    for (const w of grAuthorWords) {
      for (const fb of (authorWordIndex.get(w) || [])) {
        if (!seenFaire.has(fb.isbn)) candidateIsbns.add(fb.isbn)
      }
    }

    const candidates = [...candidateIsbns]
      .map(isbn => ({ isbn, ...faireBooks[isbn] }))
      .filter(fb => authorExactMatch(gr.author, fb.autor))

    if (candidates.length === 0) continue

    const grTitle = cleanTitle(gr.title)
    let bestScore = 0, bestFb = null
    for (const fb of candidates) {
      const score = titleOnlyScore(grTitle, fb.titulo)
      if (score > bestScore) { bestScore = score; bestFb = fb }
    }

    const n = candidates.length
    let accept = false
    if      (n === 1)  accept = bestScore >= 20   // single candidate: low bar (possible translated title)
    else if (n <= 3)   accept = bestScore >= 55
    else               accept = bestScore >= 65

    if (accept && bestFb && !seenFaire.has(bestFb.isbn)) {
      console.log(`[step3] "${gr.title}" → "${bestFb.titulo}" (n=${n}, score ${bestScore.toFixed(1)})`)
      seenFaire.add(bestFb.isbn)
      matched.push(createMatch(gr, bestFb.isbn, bestFb))
    }
  }

  return matched
}

// ── localStorage helpers ──────────────────────────────────

function loadBookState() {
  try { return JSON.parse(localStorage.getItem(LS_STATE_KEY) || '{}') } catch { return {} }
}
function saveBookState(state) { localStorage.setItem(LS_STATE_KEY, JSON.stringify(state)) }

function loadManualBooks() {
  try { return JSON.parse(localStorage.getItem(LS_MANUAL_KEY) || '{}') } catch { return {} }
}
function saveManualBooks(obj) { localStorage.setItem(LS_MANUAL_KEY, JSON.stringify(obj)) }

function loadHiddenBooks() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_HIDDEN_KEY) || '[]')) } catch { return new Set() }
}
function saveHiddenBooks(set) { localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify([...set])) }

function extractUserId(input) {
  const trimmed = input.trim()
  const match = trimmed.match(/\/user\/show\/(\d+)/)
  if (match) return match[1]
  if (/^\d+$/.test(trimmed)) return trimmed
  return null
}

// ── Hook ─────────────────────────────────────────────────

export function useBooks() {
  const [faireBooks, setFaireBooks]         = useState(null)
  const [rawBooks, setRawBooks]             = useState(null)
  const [bookState, setBookState]           = useState(loadBookState)
  const [manualBooks, setManualBooks]       = useState(loadManualBooks)
  const [hiddenBooks, setHiddenBooks]       = useState(loadHiddenBooks)
  const [userId, setUserId]                 = useState(() => localStorage.getItem(LS_USER_KEY))
  const [fetching, setFetching]             = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError]                   = useState(null)

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'feira_books.json')
      .then(r => r.json())
      .then(setFaireBooks)
      .catch(() => setError('Não foi possível carregar o catálogo da feira.'))
  }, [])

  useEffect(() => {
    if (!userId) return
    try {
      const cached = localStorage.getItem(LS_CACHE_KEY)
      if (cached) setRawBooks(JSON.parse(cached))
    } catch {}
  }, [userId])

  useEffect(() => {
    if (!faireBooks || !userId || rawBooks !== null) return
    const controller = new AbortController()
    setFetching(true)
    setError(null)
    fetchAndMatch(userId, faireBooks, setLoadingMessage, controller.signal)
      .then(matched => {
        localStorage.setItem(LS_CACHE_KEY, JSON.stringify(matched))
        setRawBooks(matched)
        setFetching(false)
      })
      .catch(e => {
        if (e.name === 'AbortError') return
        setError('Não foi possível carregar os livros do Goodreads. Verifica se o teu perfil é público.')
        setFetching(false)
      })
    return () => controller.abort()
  }, [faireBooks, userId, rawBooks])

  // Migrate legacy feira_manual_isbns (ISBN array) → feira_manual_books (full objects)
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

  // Manually added books — stored as full objects, no faireBooks lookup needed.
  // Excluded if the ISBN already appears in rawBooks (Goodreads-matched).
  const matchedIds = new Set((rawBooks || []).map(b => b.id))
  const manualBooksArr = Object.entries(manualBooks)
    .filter(([isbn]) => !hiddenBooks.has(isbn))
    .filter(([isbn]) => !matchedIds.has(isbn))
    .map(([isbn, fb]) => ({
      id:                     isbn,
      gr_title:               fb.titulo,
      gr_author:              fb.autor,
      gr_shelf:               null,
      gr_my_rating:           0,
      feira_titulo:           fb.titulo,
      feira_autor:            fb.autor,
      feira_participante:     fb.participante,
      feira_stand:            fb.stand,
      feira_pvp:              fb.pvp,
      feira_pvp_feira:        fb.pvp_feira,
      feira_pvp_livro_do_dia: fb.pvp_livro_do_dia,
      discountDates:          fb.datas || [],
      livroDodia:             fb.livroDodia ?? false,
      feira_cover_jpg:        fb.cover,
      manuallyAdded:          true,
    }))

  const books = [...(rawBooks || []).filter(b => !hiddenBooks.has(b.id)), ...manualBooksArr].map(b => ({
    ...b,
    // livroDodia may be absent in caches written before the field was introduced.
    // All rawBooks come from faireBooks (all LDD); manuallyAdded books default to false.
    livroDodia: b.livroDodia ?? !b.manuallyAdded,
    wantToBuy: bookState[b.id]?.wantToBuy ?? (b.manuallyAdded ? true : false),
    bought:    bookState[b.id]?.bought    ?? false,
  }))

  function removeBook(id) {
    // Remove from manual list (if it was manually added)
    setManualBooks(prev => {
      const { [id]: _, ...next } = prev
      saveManualBooks(next); return next
    })
    // Hide from Goodreads-matched list too
    setHiddenBooks(prev => {
      const next = new Set([...prev, id])
      saveHiddenBooks(next); return next
    })
  }

  function addManual(isbn, bookData) {
    setManualBooks(prev => {
      const next = { ...prev, [isbn]: bookData }
      saveManualBooks(next); return next
    })
    setBookState(prev => {
      const next = { ...prev, [isbn]: { wantToBuy: true, bought: prev[isbn]?.bought || false } }
      saveBookState(next); return next
    })
  }

  function removeManual(isbn) {
    setManualBooks(prev => {
      const { [isbn]: _, ...next } = prev
      saveManualBooks(next); return next
    })
  }

  function setUser(input) {
    const id = extractUserId(input)
    if (!id) { setError('URL inválido. Copia o URL do teu perfil do Goodreads.'); return false }
    localStorage.setItem(LS_USER_KEY, id)
    localStorage.removeItem(LS_CACHE_KEY)
    setUserId(id); setRawBooks(null); setError(null)
    return true
  }

  function clearUser() {
    localStorage.removeItem(LS_USER_KEY); localStorage.removeItem(LS_CACHE_KEY)
    setUserId(null); setRawBooks(null); setError(null)
  }

  function refresh() { localStorage.removeItem(LS_CACHE_KEY); setRawBooks(null) }

  function toggleWant(id) {
    setBookState(prev => {
      const cur = prev[id] || {}
      const next = cur.wantToBuy ? { wantToBuy: false, bought: false } : { ...cur, wantToBuy: true }
      const updated = { ...prev, [id]: next }; saveBookState(updated); return updated
    })
  }

  function toggleBought(id) {
    setBookState(prev => {
      const cur = prev[id] || {}
      const next = cur.bought ? { ...cur, bought: false } : { wantToBuy: true, bought: true }
      const updated = { ...prev, [id]: next }; saveBookState(updated); return updated
    })
  }

  return {
    books,
    faireBooks,
    manualBooks,
    loading:        fetching || (!!userId && rawBooks === null && !error),
    loadingMessage,
    needsOnboarding: !userId,
    error,
    setUser, clearUser, refresh, toggleWant, toggleBought, addManual, removeManual, removeBook,
  }
}
