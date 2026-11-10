import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useRecent } from '../store'

/** Ajoute la fiche courante aux onglets récents de la barre du haut. */
export function useTrackRecent(type, id, exists) {
  const { pathname } = useLocation()
  useEffect(() => {
    if (exists) useRecent.getState().open({ key: `${type}:${id}`, type, id, path: pathname })
  }, [type, id, exists, pathname])
}
