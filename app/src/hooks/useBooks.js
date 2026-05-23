import { useState, useEffect } from 'react'
import Papa from 'papaparse'

const LS_KEY = 'feira_book_state'

function decodeHtml(str) {
  const txt = document.createElement('textarea')
  txt.innerHTML = str
  return txt.value
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state))
}

export function useBooks() {
  const [rawBooks, setRawBooks] = useState([])
  const [bookState, setBookState] = useState(loadState)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('matched_books.csv')
      .then(r => r.text())
      .then(text => {
        const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })
        setRawBooks(data)
        setLoading(false)
      })
  }, [])

  const books = rawBooks.map(b => ({
    ...b,
    id: b.gr_book_id,
    feira_participante: decodeHtml(b.feira_participante),
    wantToBuy: bookState[b.gr_book_id]?.wantToBuy || false,
    bought: bookState[b.gr_book_id]?.bought || false,
    discountDates: b.feira_livro_do_dia_datas
      .split(',')
      .map(d => d.trim())
      .filter(Boolean),
  }))

  function toggleWant(id) {
    setBookState(prev => {
      const current = prev[id] || {}
      const next = current.wantToBuy
        ? { wantToBuy: false, bought: false }
        : { ...current, wantToBuy: true }
      const updated = { ...prev, [id]: next }
      saveState(updated)
      return updated
    })
  }

  function toggleBought(id) {
    setBookState(prev => {
      const current = prev[id] || {}
      const next = current.bought
        ? { ...current, bought: false }
        : { wantToBuy: true, bought: true }
      const updated = { ...prev, [id]: next }
      saveState(updated)
      return updated
    })
  }

  return { books, loading, toggleWant, toggleBought }
}
