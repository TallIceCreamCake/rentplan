import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { reloadToUpdate, useAppUpdate } from '../lib/updates'
import { Icon } from './ui'

/** Passe à la nouvelle version au premier changement de page qui suit son installation. */
export function UpdateOnNavigate() {
  const { pathname } = useLocation()
  const available = useAppUpdate((s) => s.available)
  const seenAt = useRef(null)
  useEffect(() => {
    if (!available) return
    if (seenAt.current === null) {
      seenAt.current = pathname
      return
    }
    if (pathname !== seenAt.current) reloadToUpdate()
  }, [available, pathname])
  return null
}

/** Bandeau affiché quand une nouvelle version a été installée sur le serveur. */
export function UpdateBanner() {
  const available = useAppUpdate((s) => s.available)
  const [waiting, setWaiting] = useState(false)
  if (!available) return null
  return (
    <div className="update-bar">
      <Icon name="system_update_alt" size={18} />
      <span>
        Une nouvelle version de RentPlan est installée{available.message ? ` (${available.message})` : ''}. Elle s'appliquera au prochain changement de page.
      </span>
      <button
        type="button"
        className="btn-link"
        disabled={waiting}
        onClick={() => {
          setWaiting(true)
          reloadToUpdate()
        }}
      >
        {waiting ? 'Enregistrement en cours…' : 'Recharger maintenant'}
      </button>
    </div>
  )
}
