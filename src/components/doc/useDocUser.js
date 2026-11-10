import { useMemo } from 'react'
import { useAuth } from '../../lib/auth'

/** Utilisateur connecté tel que le voient les variables {$user.*} des modèles. */
export function useDocUser() {
  const name = useAuth((s) => s.profile?.fullName)
  const email = useAuth((s) => s.profile?.email)
  const role = useAuth((s) => s.role?.name)
  return useMemo(() => ({ name: name || 'Utilisateur', email: email || '', role: role || '' }), [name, email, role])
}
