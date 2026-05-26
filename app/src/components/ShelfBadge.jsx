import { useLanguage } from '../LanguageContext'
import { makeT } from '../i18n'

const GR_SHELF_KEY = {
  'to-read':           'gr_to_read',
  'currently-reading': 'gr_reading',
  'read':              'gr_read',
  'did-not-finish':    'gr_dnf',
}

export function ShelfBadge({ shelf }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
  if (!shelf) return null
  return (
    <span className={`shelf-badge shelf-badge--${shelf}`}>
      {t(GR_SHELF_KEY[shelf] || shelf)}
    </span>
  )
}
