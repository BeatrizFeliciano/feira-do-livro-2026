import { useState, useEffect, useRef } from 'react'
import { useBooks } from './hooks/useBooks'
import { BooksPage } from './pages/BooksPage'
import { MapPage } from './pages/MapPage'
import { CatalogPage } from './pages/CatalogPage'
import { useLanguage } from './LanguageContext'
import { makeT } from './i18n'
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
  { key: 'catalog', labelKey: 'nav_catalog' },
  { key: 'books',   labelKey: 'nav_books' },
  { key: 'map',     labelKey: 'nav_map' },
]

function AboutPage({ needsOnboarding, loading, loadingMessage, onStart, onSetUser, onClearUser, onRefresh, error }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
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
        <p className="about-subtitle" dangerouslySetInnerHTML={{ __html: t('about_subtitle').replace('\n', '<br/>') }} />
        <ul className="about-features">
          <li dangerouslySetInnerHTML={{ __html: t('about_feature_1') }} />
          <li dangerouslySetInnerHTML={{ __html: t('about_feature_2') }} />
          <li dangerouslySetInnerHTML={{ __html: t('about_feature_3') }} />
          <li dangerouslySetInnerHTML={{ __html: t('about_feature_4') }} />
          <li dangerouslySetInnerHTML={{ __html: t('about_feature_5') }} />
        </ul>

        {needsOnboarding ? (
          <>
            <form className="onboarding-form" onSubmit={handleSubmit}>
              <p className="onboarding-instructions">
                {t('about_gr_instructions')}
              </p>
              <input
                className="onboarding-input"
                type="text"
                placeholder="https://www.goodreads.com/user/show/..."
                value={input}
                onChange={e => setInput(e.target.value)}
              />
              {error && <p className="onboarding-error">{t(error)}</p>}
              <button className="about-btn" type="submit" disabled={!input.trim()}>
                {t('about_gr_btn')}
              </button>
            </form>
            <button className="about-skip-btn" onClick={onStart}>
              {t('about_skip_btn')}
            </button>
          </>
        ) : loading ? (
          <div className="onboarding-loading">
            <div className="loading-spinner" />
            <p className="onboarding-loading__msg">{loadingMessage || t('loading_gr')}</p>
          </div>
        ) : (
          <>
            <button className="about-btn" onClick={onStart}>
              {t('about_view_catalog')}
            </button>
            <div className="about-account">
              <button className="about-account-btn" onClick={onRefresh}>
                {t('about_refresh')}
              </button>
              <span className="about-account-sep">·</span>
              <button className="about-account-btn" onClick={onClearUser}>
                {t('about_change_acct')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const { lang, toggleLang } = useLanguage()
  const t = makeT(lang)

  const [tab, setTab] = useState(getTabFromHash)
  const [openStand, setOpenStand] = useState(null)
  const [notification, setNotification] = useState(null) // { type: 'error'|'warning', messageKey }
  const {
    books, manualBooks, grBooks, faireBooks, loading, loadingMessage, needsOnboarding, error,
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
      setNotification({ type: 'error', messageKey: 'error_gr_profile' })
    } else if (grBooks.length === 0) {
      setNotification({ type: 'warning', messageKey: 'error_gr_empty' })
    }
    navigate('catalog')
  }, [loading, needsOnboarding, tab, error, grBooks.length])

  // Auto-dismiss errors only; warnings stay until manually closed
  useEffect(() => {
    if (!notification || notification.type !== 'error') return
    const timer = setTimeout(() => setNotification(null), 6000)
    return () => clearTimeout(timer)
  }, [notification])

  // Dismiss any warning if books are successfully loaded
  useEffect(() => {
    if (grBooks.length > 0 && notification?.type === 'warning') setNotification(null)
  }, [grBooks.length])

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
            aria-label={t('nav_home_aria')}
          >
            <img src={logoUrl} alt="My Books" className="app-logo" />
          </button>
          <nav className="app-tabs">
            {TABS.map(tabItem => (
              <button
                key={tabItem.key}
                className={`app-tab ${tab === tabItem.key ? 'active' : ''}`}
                onClick={() => navigate(tabItem.key)}
              >
                {t(tabItem.labelKey)}
              </button>
            ))}
          </nav>
          <button className="lang-toggle" onClick={toggleLang}>
            {lang === 'pt' ? 'EN' : 'PT'}
          </button>
        </div>
      </header>

      {notification && (
        <div className={`app-notification app-notification--${notification.type}`}>
          <span>{t(notification.messageKey)}</span>
          <button className="app-notification__close" onClick={() => setNotification(null)}>✕</button>
        </div>
      )}

      <main className={tab === 'map' ? 'app-main app-main--fullwidth' : tab === 'about' ? 'app-main app-main--about' : 'app-main'}>
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
            onNavigateToCatalog={() => navigate('catalog')}
          />
        ) : tab === 'catalog' ? (
          <CatalogPage manualBooks={manualBooks} books={books} grBooks={grBooks} faireBooks={faireBooks} needsOnboarding={needsOnboarding} onAdd={addManual} onRemove={removeManual} onConnectGoodreads={() => navigate('about')} />
        ) : (
          <MapPage books={books} onToggleWant={toggleWant} onToggleBought={toggleBought} openStand={openStand} onStandOpened={() => setOpenStand(null)} />
        )}
      </main>
    </div>
  )
}
