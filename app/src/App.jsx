import { useState } from 'react'
import { useBooks } from './hooks/useBooks'
import { BooksPage } from './pages/BooksPage'
import { DaysPage } from './pages/DaysPage'
import { MapPage } from './pages/MapPage'
import logoUrl from './assets/logo.svg'
import './App.css'

const TABS = [
  { key: 'books', label: 'Os Meus Livros' },
  { key: 'days', label: 'Os Meus Livros Por Dia' },
  { key: 'map', label: 'Mapa' },
]

function AboutPage({ onStart }) {
  return (
    <div className="about-page">
      <div className="about-card">
        <img src={logoUrl} alt="My Books" className="about-logo" />
        <p className="about-subtitle">Os meus livros do Goodreads<br />na Feira do Livro de Lisboa 2026</p>
        <ul className="about-features">
          <li>Cruza a tua lista do Goodreads com os <strong>livros do dia</strong> com desconto</li>
          <li>Marca os livros que <strong>queres comprar</strong> e os que já <strong>compraste</strong></li>
          <li>Vê em que dias cada livro tem desconto e quanto poupas</li>
          <li>Encontra o stand no <strong>mapa da feira</strong> para não perderes tempo</li>
        </ul>
        <p className="about-note">Só aparecem livros incluídos nos livros do dia — para maximizares as poupanças na feira.</p>
        <button className="about-btn" onClick={onStart}>
          Ver os meus livros →
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('about')
  const { books, loading, toggleWant, toggleBought } = useBooks()

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <button
            className="app-logo-btn"
            onClick={() => setTab('about')}
            aria-label="Início"
          >
            <img src={logoUrl} alt="My Books" className="app-logo" />
          </button>
          <nav className="app-tabs">
            {TABS.map(t => (
              <button
                key={t.key}
                className={`app-tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className={tab === 'map' ? 'app-main app-main--fullwidth' : 'app-main'}>
        {tab === 'about' ? (
          <AboutPage onStart={() => setTab('books')} />
        ) : loading ? (
          <div className="loading">A carregar...</div>
        ) : tab === 'books' ? (
          <BooksPage books={books} onToggleWant={toggleWant} onToggleBought={toggleBought} />
        ) : tab === 'days' ? (
          <DaysPage books={books} onToggleWant={toggleWant} onToggleBought={toggleBought} />
        ) : (
          <MapPage books={books} onToggleWant={toggleWant} onToggleBought={toggleBought} />
        )}
      </main>
    </div>
  )
}
