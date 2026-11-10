import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

/** Emplacement des boutons à droite du titre de la rubrique (« Fermer », « Sauvegarder »). */
export const HeaderSlot = createContext(null)

export function HeaderActions({ children }) {
  const node = useContext(HeaderSlot)
  return node ? createPortal(children, node) : null
}
