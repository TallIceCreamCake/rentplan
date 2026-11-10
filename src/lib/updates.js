import { create } from 'zustand'
import { useSyncStatus } from './db'

// Version injectée par l'agent de déploiement (deploy/agent.mjs) au moment de la compilation.
// Absente en développement et pour un « npm run build » manuel : la surveillance est alors désactivée.
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || null
export const APP_BUILT_AT = import.meta.env.VITE_APP_BUILT_AT || null

/** available : description de la nouvelle version installée sur le serveur (version.json), sinon null. */
export const useAppUpdate = create(() => ({ available: null }))

const CHECK_EVERY_MS = 60_000

/** Compare la version servie (version.json) à celle de cette page. */
export async function checkInstalledVersion() {
  if (!APP_VERSION) return
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const latest = await res.json()
    if (latest?.version && latest.version !== APP_VERSION) useAppUpdate.setState({ available: latest })
  } catch {
    // serveur momentanément indisponible (redémarrage pendant une mise à jour)
  }
}

/** Interroge régulièrement le serveur pour savoir si une nouvelle version a été installée. */
export function watchForUpdates() {
  if (!APP_VERSION || import.meta.env.DEV) return
  const check = checkInstalledVersion
  check()
  setInterval(check, CHECK_EVERY_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}

/**
 * Recharge la page pour passer à la nouvelle version, sans perdre de modification :
 * on attend que les écritures vers la base soient terminées (elles partent 250 ms après un changement).
 */
export function reloadToUpdate() {
  const settled = () => ['saved', 'local'].includes(useSyncStatus.getState().state)
  const attempt = () => {
    if (!settled()) return setTimeout(attempt, 500)
    setTimeout(() => (settled() ? window.location.reload() : attempt()), 600)
  }
  attempt()
}
