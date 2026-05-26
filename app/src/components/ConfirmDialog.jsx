import { createPortal } from 'react-dom'
import { useLanguage } from '../LanguageContext'
import { makeT } from '../i18n'

export function ConfirmDialog({ message, onConfirm, onCancel }) {
  const { lang } = useLanguage()
  const t = makeT(lang)
  return createPortal(
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__btn confirm-dialog__btn--cancel" onClick={onCancel}>
            {t('confirm_cancel')}
          </button>
          <button className="confirm-dialog__btn confirm-dialog__btn--confirm" onClick={onConfirm}>
            {t('confirm_remove')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
