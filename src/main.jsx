import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { boot, shutdown } from './store'
import { initAuth } from './lib/auth'
import { watchForUpdates } from './lib/updates'
import './styles.css'

// Les données se chargent une fois le compte connecté et activé
initAuth({ onReady: boot, onSignedOut: shutdown })
// Détecte les nouvelles versions installées automatiquement sur le serveur
watchForUpdates()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
