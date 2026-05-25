import { useState, useEffect, useRef } from 'react'
import { useBooks } from './hooks/useBooks'
import { BooksPage } from './pages/BooksPage'
import { MapPage } from './pages/MapPage'
import { CatalogPage } from './pages/CatalogPage'
import logoUrl from './assets/logo.svg'
import './App.css'

const VALID_TABS = new Set(['books', 'map', 'catalog'])

function getTabFromHash() {
  const hash = window.location.hash.replace('#', '')
  return VALID_TABS.has(hash) ? hash : 'about'
}

function setHash(tab) {
  if (tab === 'about') {
    // Remove the hash entirely rather than leaving a trailing '#'
    history.pushState(null, '', window.location.pathname + window.location.search)
  } else {
    window.location.hash = tab
  }
}

const TABS = [
  { key: 'catalog', label: 'Catálogo da Feira' },
  { key: 'books',   label: 'Os Meus Livros' },
  { key: 'map',     label: 'Mapa' },
]

function AboutPage({ needsOnboarding, loading, loadingMessage, onStart, onSetUser, onClearUser, onRefresh, error }) {
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
        <p className="about-subtitle">Os meus livros na<br/>Feira do Livro de Lisboa 2026</p>
        <ul className="about-features">
          <li>Explora o <strong>catálogo completo</strong> da feira e adiciona livros à tua lista</li>
          <li>Vê quais os <strong>livros do dia</strong> com desconto e em que dias estão disponíveis</li>
          <li>Liga o <strong>Goodreads</strong> para encontrares automaticamente os teus livros na feira</li>
          <li>Acompanha o que já <strong>compraste</strong> e quanto <strong>poupaste</strong></li>
          <li>Localiza qualquer stand no <strong>mapa da feira</strong></li>
        </ul>

        {needsOnboarding ? (
          <>
            <form className="onboarding-form" onSubmit={handleSubmit}>
              <p className="onboarding-instructions">
                Liga o Goodreads para cruzar a tua lista com os livros da feira.
                <br />
                Copia o URL do teu perfil do Goodreads:
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
                Ligar Goodreads →
              </button>
            </form>
            <button className="about-skip-btn" onClick={onStart}>
              Continuar sem Goodreads →
            </button>
          </>
        ) : loading ? (
          <div className="onboarding-loading">
            <div className="loading-spinner" />
            <p className="onboarding-loading__msg">{loadingMessage || 'A carregar os teus livros do Goodreads…'}</p>
          </div>
        ) : (
          <>
            <button className="about-btn" onClick={onStart}>
              Ver o catálogo →
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
  const [tab, setTab] = useState(getTabFromHash)
  const [openStand, setOpenStand] = useState(null)
  const [notification, setNotification] = useState(null) // { type: 'error'|'warning', message }
  const {
    books, manualBooks, grBooks, loading, loadingMessage, needsOnboarding, error,
    setUser, clearUser, refresh, toggleWant, toggleBought, addManual, removeManual,
  } = useBooks()

  // Sync tab state when the user navigates with the browser back/forward buttons
  useEffect(() => {
    const onHashChange = () => setTab(getTabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(newTab) {
    setHash(newTab)
    if (newTab === 'about') setTab('about')
  }

  // When GR loading finishes while on the about page → always navigate to catalog.
  // Show a toast if something went wrong or no books matched.
  const prevLoadingRef = useRef(loading)
  useEffect(() => {
    const wasLoading = prevLoadingRef.current
    prevLoadingRef.current = loading
    if (!wasLoading || loading || needsOnboarding || tab !== 'about') return
    if (error) {
      setNotification({ type: 'error', message: 'Não foi possível carregar os livros do Goodreads. Verifica se o teu perfil e as tuas listas são públicos.' })
    } else if (grBooks.length === 0) {
      setNotification({ type: 'warning', message: 'Nenhum livro da tua lista foi encontrado na feira. Verifica se as tuas listas no Goodreads são públicas.' })
    }
    navigate('catalog')
  }, [loading, needsOnboarding, tab, error, grBooks.length])

  // Auto-dismiss errors only; warnings stay until manually closed
  useEffect(() => {
    if (!notification || notification.type !== 'error') return
    const t = setTimeout(() => setNotification(null), 6000)
    return () => clearTimeout(t)
  }, [notification])

  function handleSetUser(input) {
    return setUser(input)  // stay on about — loading effect above handles navigation
  }

  function handleRefresh() {
    refresh()
    navigate('about')  // go back to about to show loading state
  }

  function handleClearUser() {
    clearUser()
    navigate('about')
  }

  function handleShowOnMap(stand) {
    setOpenStand(stand)
    navigate('map')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <button
            className="app-logo-btn"
            onClick={() => navigate('about')}
            aria-label="Início"
          >
            <img src={logoUrl} alt="My Books" className="app-logo" />
          </button>
          <nav className="app-tabs">
            {TABS.map(t => (
              <button
                key={t.key}
                className={`app-tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => navigate(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {notification && (
        <div className={`app-notification app-notification--${notification.type}`}>
          <span>{notification.message}</span>
          <button className="app-notification__close" onClick={() => setNotification(null)}>✕</button>
        </div>
      )}

      <main className={tab === 'map' ? 'app-main app-main--fullwidth' : 'app-main'}>
        {tab === 'about' ? (
          <AboutPage
            needsOnboarding={needsOnboarding}
            loading={loading}
            loadingMessage={loadingMessage}
            onStart={() => navigate('catalog')}
            onSetUser={handleSetUser}
            onClearUser={handleClearUser}
            onRefresh={handleRefresh}
            error={error}
          />
        ) : tab === 'books' ? (
          <BooksPage
            books={books}
            loading={loading}
            loadingMessage={loadingMessage}
            error={error}
            onToggleWant={toggleWant}
            onToggleBought={toggleBought}
            onShowOnMap={handleShowOnMap}

          />
        ) : tab === 'catalog' ? (
          <CatalogPage manualBooks={manualBooks} books={books} grBooks={grBooks} needsOnboarding={needsOnboarding} onAdd={addManual} onRemove={removeManual} onConnectGoodreads={() => navigate('about')} />
        ) : (
          <MapPage books={books} onToggleWant={toggleWant} onToggleBought={toggleBought} openStand={openStand} onStandOpened={() => setOpenStand(null)} />
        )}
      </main>
    </div>
  )
}
