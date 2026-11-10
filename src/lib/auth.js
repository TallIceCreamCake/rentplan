import { useMemo } from 'react'
import { create } from 'zustand'
import { DB_ENABLED, supabase } from './db'
import { makeAccess, ROLE_PRESETS } from './permissions'
import { toast } from './toast'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const LOCAL_KEY = 'rentplan-local-account'

// ---------- Conversion base ↔ application ----------
const toProfile = (r) => ({
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  roleId: r.role_id,
  active: r.active,
  crewId: r.crew_id,
  dashboards: r.dashboards || [],
  preferences: r.preferences || {},
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
})
const toRole = (r) => r && { id: r.id, name: r.name, permissions: r.permissions || {}, isSystem: r.is_system, sort: r.sort }

// ---------- Mode local (sans Supabase) : un seul compte, enregistré dans ce navigateur ----------
function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY))
    if (v?.id) return v
  } catch {
    /* stockage indisponible : compte par défaut */
  }
  return { id: 'local', email: '', fullName: 'Administrateur', roleId: 'poweruser', active: true, crewId: null, dashboards: [], preferences: {} }
}
function writeLocal(profile) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(profile))
  } catch {
    /* stockage indisponible : le profil reste en mémoire */
  }
}

/** status : loading | signedOut | pending (compte à activer) | ready | error */
export const useAuth = create(() =>
  DB_ENABLED
    ? { status: 'loading', session: null, profile: null, role: null, error: null }
    : { status: 'ready', session: null, profile: readLocal(), role: ROLE_PRESETS[0], error: null },
)

/** Droits du compte connecté. */
export function useAccess() {
  const role = useAuth((s) => s.role)
  const profile = useAuth((s) => s.profile)
  return useMemo(() => makeAccess(role, profile), [role, profile])
}
export const currentAccess = () => {
  const { role, profile } = useAuth.getState()
  return makeAccess(role, profile)
}
export const currentUserName = () => useAuth.getState().profile?.fullName || 'Utilisateur'

// ---------- Messages d'erreur ----------
const MESSAGES = [
  [/invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
  [/email not confirmed/i, 'Adresse e-mail non confirmée.'],
  [/already (been )?registered|already exists/i, 'Un compte existe déjà avec cette adresse e-mail.'],
  [/password should be at least|at least 6 characters/i, 'Le mot de passe doit contenir au moins 6 caractères.'],
  [/unable to validate email|invalid email|is invalid/i, 'Adresse e-mail invalide.'],
  [/rate limit|too many/i, 'Trop de tentatives : réessayez dans quelques minutes.'],
  [/signups? not allowed/i, 'La création de comptes est désactivée.'],
  [/failed to fetch|networkerror|load failed/i, 'Impossible de joindre Supabase. Lancez la base avec « npm run db:start ».'],
]
export const authMessage = (e) => {
  const m = e?.message || e?.msg || String(e)
  return (MESSAGES.find(([re]) => re.test(m)) || [null, m])[1]
}

// ---------- Session ----------
let hooks = { onReady: () => {}, onSignedOut: () => {} }
let readyFor = null // compte dont les données sont chargées
let accountChannel = null
let refreshTimer = null

/** Démarre l'écoute de la session ; onReady(profil) charge les données, onSignedOut les décharge. */
export function initAuth(h) {
  hooks = { ...hooks, ...h }
  if (!DB_ENABLED) {
    hooks.onReady(useAuth.getState().profile)
    return
  }
  supabase.auth.onAuthStateChange((event, session) => {
    // Appeler Supabase dans ce rappel bloque le client : le traitement est différé
    setTimeout(() => handleSession(event, session), 0)
  })
}

async function handleSession(event, session) {
  if (!session) {
    stopAccountChannel()
    const wasReady = readyFor
    readyFor = null
    useAuth.setState({ status: 'signedOut', session: null, profile: null, role: null, error: null })
    if (wasReady) hooks.onSignedOut()
    return
  }
  useAuth.setState({ session })
  if (event === 'TOKEN_REFRESHED' && readyFor === session.user.id) return
  await refreshProfile(session.user.id)
}

/** Recharge le profil et le rôle (droits modifiés par un administrateur, activation…). */
export async function refreshProfile(uid = useAuth.getState().session?.user?.id) {
  if (!uid || !DB_ENABLED) return
  const { data, error } = await supabase.from('profiles').select('*, role:user_roles(*)').eq('id', uid).maybeSingle()
  if (error) {
    useAuth.setState({ status: 'error', error: authMessage(error) })
    return
  }
  if (!data) {
    // Compte supprimé entre-temps
    await supabase.auth.signOut()
    return
  }
  const profile = toProfile(data)
  const role = toRole(data.role)
  startAccountChannel(uid)
  if (!profile.active) {
    if (readyFor) {
      readyFor = null
      hooks.onSignedOut()
    }
    useAuth.setState({ status: 'pending', profile, role, error: null })
    return
  }
  // Une sauvegarde locale en attente garde la priorité sur l'écho venant de la base
  const local = useAuth.getState().profile
  const merged = saveTimer && local?.id === uid ? { ...profile, ...pendingPatch } : profile
  useAuth.setState({ status: 'ready', profile: merged, role, error: null })
  if (readyFor !== uid) {
    readyFor = uid
    supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', uid).then(() => {})
    hooks.onReady(merged)
  }
}

function startAccountChannel(uid) {
  if (accountChannel?.uid === uid) return
  stopAccountChannel()
  const later = () => {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => refreshProfile(uid), 300)
  }
  const channel = supabase
    .channel('rentplan-compte')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, later)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, (p) => {
      if ((p.new?.id || p.old?.id) === useAuth.getState().profile?.roleId) later()
    })
    .subscribe()
  accountChannel = { uid, channel }
}
function stopAccountChannel() {
  clearTimeout(refreshTimer)
  if (accountChannel) supabase.removeChannel(accountChannel.channel)
  accountChannel = null
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(authMessage(error))
}

export async function signUp({ fullName, email, password }) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } })
  if (error) throw new Error(authMessage(error))
  return data
}

export async function signOut() {
  if (!DB_ENABLED) return
  await flushProfile()
  await supabase.auth.signOut()
}

export async function changePassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(authMessage(error))
}

/** Faut-il proposer la création du compte administrateur (base sans aucun compte) ? */
export async function hasAccounts() {
  const { data, error } = await supabase.rpc('has_accounts')
  if (error) throw new Error(authMessage(error))
  return data
}

// ---------- Profil du compte connecté (tableaux de bord, préférences, nom) ----------
let saveTimer = null
let pendingPatch = {}

/** Modifie le profil connecté ; l'enregistrement en base est regroupé (400 ms). */
export function updateMyProfile(patch) {
  const profile = useAuth.getState().profile
  if (!profile) return
  const next = { ...profile, ...patch }
  useAuth.setState({ profile: next })
  if (!DB_ENABLED) {
    writeLocal(next)
    return
  }
  pendingPatch = { ...pendingPatch, ...patch }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushProfile, 400)
}

export async function flushProfile() {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
  const patch = pendingPatch
  pendingPatch = {}
  const row = {}
  if ('dashboards' in patch) row.dashboards = patch.dashboards
  if ('preferences' in patch) row.preferences = patch.preferences
  if ('fullName' in patch) row.full_name = patch.fullName
  const id = useAuth.getState().profile?.id
  if (!id || !Object.keys(row).length) return
  const { error } = await supabase.from('profiles').update(row).eq('id', id)
  if (error) toast(`Profil non enregistré : ${authMessage(error)}`, 'error')
}

export const setPreference = (key, value) => {
  const prefs = useAuth.getState().profile?.preferences || {}
  updateMyProfile({ preferences: { ...prefs, [key]: value } })
}

// ---------- Administration des comptes (rôle avec « Gérer les comptes ») ----------
export async function fetchAccounts() {
  const [p, r] = await Promise.all([supabase.from('profiles').select('*').order('created_at'), supabase.from('user_roles').select('*').order('sort')])
  if (p.error) throw new Error(authMessage(p.error))
  if (r.error) throw new Error(authMessage(r.error))
  return { profiles: p.data.map(toProfile), roles: r.data.map(toRole) }
}

/**
 * Crée un compte pour quelqu'un d'autre : inscription via l'API d'authentification
 * (sans toucher à la session en cours), puis activation et rôle par l'administrateur.
 */
export async function createAccount({ fullName, email, password, roleId, crewId }) {
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password, data: { full_name: fullName.trim() } }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(authMessage({ message: json.msg || json.error_description || json.message || res.statusText }))
  const id = json.user?.id || json.id
  if (!id) throw new Error('Création du compte impossible.')
  await updateAccount(id, { roleId, crewId, fullName, active: true })
  return id
}

export async function updateAccount(id, { roleId, crewId, fullName, active }) {
  const row = {}
  if (roleId !== undefined) row.role_id = roleId
  if (crewId !== undefined) row.crew_id = crewId || null
  if (fullName !== undefined) row.full_name = fullName.trim()
  if (active !== undefined) row.active = active
  const { error } = await supabase.from('profiles').update(row).eq('id', id)
  if (error) throw new Error(authMessage(error))
}

export async function setAccountPassword(id, password) {
  const { error } = await supabase.rpc('admin_set_password', { target: id, new_password: password })
  if (error) throw new Error(authMessage(error))
}

export async function deleteAccount(id) {
  const { error } = await supabase.rpc('admin_delete_user', { target: id })
  if (error) throw new Error(authMessage(error))
}

export async function saveRole(role) {
  const { error } = await supabase.from('user_roles').upsert({ id: role.id, name: role.name, permissions: role.permissions, sort: role.sort ?? 99, is_system: Boolean(role.isSystem) })
  if (error) throw new Error(authMessage(error))
}

export async function deleteRole(id) {
  const { error } = await supabase.from('user_roles').delete().eq('id', id)
  if (error) throw new Error(/foreign key|violates/i.test(error.message) ? 'Ce rôle est encore attribué à des comptes.' : authMessage(error))
}
