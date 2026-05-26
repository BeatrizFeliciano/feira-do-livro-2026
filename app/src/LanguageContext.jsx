import { createContext, useContext, useState } from 'react'

const LanguageContext = createContext({ lang: 'pt', toggleLang: () => {} })

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('feira_lang') || 'pt')

  function toggleLang() {
    const next = lang === 'pt' ? 'en' : 'pt'
    setLang(next)
    localStorage.setItem('feira_lang', next)
  }

  return (
    <LanguageContext.Provider value={{ lang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
