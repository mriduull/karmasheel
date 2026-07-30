import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './en'

// Only English ships today — no language detector plugin, and no visible
// switcher is built anywhere in the UI (design spec §23). Frontend-owned
// copy is still routed through this catalog so a future Nepali
// translation is a content addition, not a rewrite.
void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18next
