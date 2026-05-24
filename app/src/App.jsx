import { useState } from 'react'
import { useBooks } from './hooks/useBooks'
import { BooksPage } from './pages/BooksPage'
import { DaysPage } from './pages/DaysPage'
import { MapPage } from './pages/MapPage'
import logoUrl from './assets/logo.svg'
import './App.css'

const TABS = [
  { key: 'books', label: 'Os Meus Livros' },
  { key: 'days',  label: 'Os Meus Livros Por Dia' },
  { key: 'map',   label: 'Mapa' },
]

function AboutPage({ needsOnboarding, onStart, onSetUser, onClearUser, onRefresh, error }) {
  const [input, setInput] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const ok = onSetUser(input)
    if (ok) setInput('')
  }

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

        {needsOnboarding ? (
          <form className="onboarding-form" onSubmit={handleSubmit}>
            <p className="onboarding-instructions">
              Para começar, vai ao teu perfil do Goodreads e copia o URL do browser.
              <br />
              <span className="onboarding-example">ex: goodreads.com/user/show/12345678-nome</span>
            </p>
            <input
              className="onboarding-input"
              type="text"
              placeholder="https://www.goodreads.com/user/show/..."
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            {error && <p className="onboarding-error">{error}</p>}
            <button className="about-btn" type="submit" disabled={!input.trim()}>
              Carregar os meus livros →
            </button>
          </form>
        ) : (
          <>
            <button className="about-btn" onClick={onStart}>
              Ver os meus livros →
            </button>
            <div className="about-account">
              <button className="about-account-btn" onClick={onRefresh}>
                Atualizar livros
              </button>
              <span className="about-account-sep">·</span>
              <button className="about-account-btn" onClick={onClearUser}>
                Mudar conta
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('about')
  const [openStand, setOpenStand] = useState(null)
  const {
    books, loading, loadingMessage, needsOnboarding, error,
    setUser, clearUser, refresh, toggleWant, toggleBought,
  } = useBooks()

  function handleSetUser(input) {
    const ok = setUser(input)
    if (ok) setTab('books')
    return ok
  }

  function handleRefresh() {
    refresh()
    setTab('books')
  }

  function handleClearUser() {
    clearUser()
    setTab('about')
  }

  function handleShowOnMap(stand) {
    setOpenStand(stand)
    setTab('map')
  }

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
          <AboutPage
            needsOnboarding={needsOnboarding}
            onStart={() => setTab('books')}
            onSetUser={handleSetUser}
            onClearUser={handleClearUser}
            onRefresh={handleRefresh}
            error={error}
          />
        ) : loading ? (
          <div className="loading">
            <div className="loading-spinner" />
            <p className="loading-detail">{loadingMessage || 'A carregar…'}</p>
          </div>
        ) : error ? (
          <div className="loading">
            <span className="loading-error">{error}</span>
            <button className="about-btn" style={{ marginTop: 16 }} onClick={() => setTab('about')}>
              Voltar
            </button>
          </div>
        ) : tab === 'books' ? (
          <BooksPage books={books} onToggleWant={toggleWant} onToggleBought={toggleBought} onShowOnMap={handleShowOnMap} />
        ) : tab === 'days' ? (
          <DaysPage books={books} onToggleWant={toggleWant} onToggleBought={toggleBought} onShowOnMap={handleShowOnMap} />
        ) : (
          <MapPage books={books} onToggleWant={toggleWant} onToggleBought={toggleBought} openStand={openStand} onStandOpened={() => setOpenStand(null)} />
        )}
      </main>
    </div>
  )
}
