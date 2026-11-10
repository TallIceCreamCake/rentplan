import { createClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import { DEFAULT_SETTINGS } from './seed'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/** La base Supabase est utilisée dès que les variables d'environnement sont définies (sinon : stockage local). */
export const DB_ENABLED = Boolean(URL && KEY)
export const supabase = DB_ENABLED ? createClient(URL, KEY, { realtime: { params: { eventsPerSecond: 20 } } }) : null

// ---------- Description des tables ----------
// Collection du store (camelCase) → table SQL (snake_case) et colonnes.
// L'ordre est celui des dépendances : parents avant enfants pour les écritures.
export const TABLES = [
  ['categories', 'categories', 'id name color parentId sort'],
  ['stockLocations', 'stock_locations', 'id name address kind isDefault archived'],
  ['projectTypes', 'project_types', 'id name color'],
  ['defaultFunctions', 'default_functions', 'id kind name internalName price priceType cost costType breakMinutes tags'],
  ['defaultCosts', 'default_costs', 'id name quantity price cost'],
  ['contacts', 'contacts', 'id type isCompany company firstName lastName email phone website address zip city country vatNumber discountEquipment discountCrew paymentTermDays notes tags customFields createdAt'],
  ['contactPersons', 'contact_persons', 'id contactId firstName lastName email phone role'],
  ['crew', 'crew_members', 'id firstName lastName email phone functions dayRate hourRate costRate color notes tags active city'],
  ['crewAvailability', 'crew_availability', 'id crewId kind startsAt endsAt title status note'],
  ['vehicles', 'vehicles', 'id name plate type capacityKg volume seats dayRate costPerKm notes tags'],
  ['equipment', 'equipment', 'id code name categoryId kind type stock serialized rentalPrice subrentalCost purchasePrice weight volume power current location defaultGroup displayInPlanner tags internalRemark externalRemark imageUrl contents accessories alternatives supplierIds archived customFields createdAt'],
  ['serials', 'serials', 'id equipmentId serial internalRef stockLocationId status notes purchaseDate'],
  ['repairs', 'repairs', 'id number equipmentId serialId quantity title description status startsAt endsAt unavailable cost reporter repairer projectId createdAt'],
  ['inspections', 'inspections', 'id equipmentId serialId name intervalMonths lastDate nextDate result notes'],
  ['projects', 'projects', 'id number name kind typeId clientId contactPersonId venueId accountManager color externalRef stockLocationId transferToId notes externalNotes tags customFields createdAt updatedBy'],
  ['subprojects', 'subprojects', 'id projectId name sort status discounts discountTotal lockedTotal insurancePct deposit depositStatus additionalConditions logistics proposal updatedBy'],
  ['periods', 'periods', 'id projectId subprojectId name startsAt endsAt isPlanning isUsage showInternal showExternal sort updatedBy'],
  ['equipmentGroups', 'equipment_groups', 'id projectId subprojectId name sort planningPeriodId usagePeriodId planStart planEnd useStart useEnd remark updatedBy'],
  ['plannedEquipment', 'planned_equipment', 'id projectId subprojectId groupId equipmentId parentId relation name quantity price discount isOptional reservedQty serialIds sort remark updatedBy'],
  ['bookings', 'bookings', 'id projectId subprojectId equipmentId pret surSite retourne perdu details updatedBy'],
  ['functionGroups', 'function_groups', 'id projectId subprojectId name sort planningPeriodId usagePeriodId updatedBy'],
  ['functions', 'functions', 'id projectId subprojectId groupId kind name internalName quantity planningPeriodId usagePeriodId planStart planEnd useStart useEnd breakMinutes priceType price costType cost distanceKm travelMinutes tags remark sort updatedBy'],
  ['assignments', 'assignments', 'id projectId subprojectId functionId crewId vehicleId planStart planEnd shifts rate visible invitation remark updatedBy'],
  ['costs', 'costs', 'id projectId subprojectId name quantity price cost discount remark sort updatedBy'],
  ['notes', 'notes', 'id projectId subprojectId scope text author createdAt'],
  ['tasks', 'tasks', 'id projectId title details status priority deadline assignees timeBudgetMin trackedMin subtasks tags color sort createdBy createdAt updatedBy'],
  ['documents', 'documents', 'id type number version projectId clientId subprojectIds date dueDate status days sections totals notes partialPct extraLines payments fromQuote signedAt templateId letterheadId body subject fileName showBackground signature content createdAt updatedBy'],
  ['returnCharges', 'return_charges', 'id projectId subprojectId equipmentId kind label quantity price note status costId invoiceId createdBy createdAt updatedBy'],
  ['subrents', 'subrents', 'id number supplierId projectId status startsAt endsAt lines cost notes createdAt updatedBy'],
  ['purchaseOrders', 'purchase_orders', 'id number supplierId projectId subrentId date status lines total notes templateId letterheadId body showBackground updatedBy'],
  ['timeEntries', 'time_entries', 'id crewId projectId functionId kind startsAt endsAt breakMinutes travelMinutes activity status notes createdAt'],
  ['requests', 'project_requests', 'id receivedAt contactName company email phone eventName startsAt endsAt venue message items status projectId'],
  ['files', 'files', 'id projectId equipmentId name path size mime author createdAt'],
].map(([collection, table, cols]) => ({ collection, table, cols: cols.split(' ') }))

export const COLLECTIONS = TABLES.map((t) => t.collection)
const byCollection = Object.fromEntries(TABLES.map((t) => [t.collection, t]))
const byTable = Object.fromEntries(TABLES.map((t) => [t.table, t]))

const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** Normalise les valeurs pour que le local et la base se comparent à l'identique. */
const norm = (v) => {
  if (typeof v !== 'string') return v
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) return v.slice(0, 16) // timestamp « heure locale »
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? v : d.toISOString()
  }
  return v
}

const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}

/** Empreinte d'une ligne : uniquement les colonnes connues, sans l'auteur de la modification. */
const canon = (t, obj) => stable(t.cols.filter((c) => c !== 'updatedBy').map((c) => norm(obj[c] ?? null)))

const EMPTY_AS_NULL = /(Id|At|Start|End|Date)$|^date$/
const toRow = (t, obj, author) => {
  const row = {}
  for (const c of t.cols) {
    if (c === 'updatedBy') row.updated_by = author
    // Une référence ou une date vide (« Aucun » dans une liste, champ effacé) est enregistrée comme absente :
    // '' violerait la clé étrangère ou le format de date
    else if (obj[c] !== undefined) row[snake(c)] = obj[c] === '' && EMPTY_AS_NULL.test(c) ? null : obj[c]
  }
  return row
}

const fromRow = (t, row) => {
  const obj = {}
  for (const c of t.cols) obj[c] = norm(row[snake(c)] ?? null)
  return obj
}

async function fetchAll(table) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// ---------- État de la synchronisation (affiché dans la barre du haut) ----------
export const useSyncStatus = create(() => ({ state: DB_ENABLED ? 'loading' : 'local', error: null, savedAt: null }))
const setStatus = (patch) => useSyncStatus.setState(patch)

let synced = {} // collection → Map(id → empreinte)
let syncedSettings = null
let pendingSettings = null // réglages en cours d'écriture : leur écho temps réel est ignoré

/** Charge toutes les tables. Renvoie null si la base est vide (première utilisation). */
export async function loadAll() {
  const settingsRes = await supabase.from('app_settings').select('*').eq('id', 'main').maybeSingle()
  if (settingsRes.error) throw settingsRes.error
  if (!settingsRes.data) return null
  const rows = await Promise.all(TABLES.map((t) => fetchAll(t.table)))
  // Les réglages ajoutés depuis la création de la base prennent leur valeur par défaut
  const data = { settings: { ...DEFAULT_SETTINGS, ...settingsRes.data.data } }
  synced = {}
  TABLES.forEach((t, i) => {
    data[t.collection] = rows[i].map((r) => fromRow(t, r))
    synced[t.collection] = new Map(data[t.collection].map((o) => [o.id, canon(t, o)]))
  })
  syncedSettings = stable(data.settings)
  return data
}

/** Vide toutes les tables (réinitialisation de la démo). */
export async function wipeAll() {
  for (const t of [...TABLES].reverse()) {
    const { error } = await supabase.from(t.table).delete().neq('id', '')
    if (error) throw error
  }
  await supabase.from('audit_log').delete().gt('id', 0)
  await supabase.from('app_settings').delete().eq('id', 'main')
  synced = {}
  syncedSettings = null
}

const dbError = (table, error) => Object.assign(new Error(`${table} : ${error.message}`), { code: error.code })

/** Écriture refusée par les règles d'accès de la base (rôle insuffisant). */
export const isDenied = (e) => e?.code === '42501' || e?.code === 'P0001' || /row-level security/i.test(e?.message || '')

/** Écriture refusée car invalide (référence introuvable, valeur hors format…) : la réessayer ne sert à rien. */
export const isInvalid = (e) => /^2[23]/.test(e?.code || '')

/**
 * Pousse vers Supabase toutes les différences entre le store et le dernier état synchronisé.
 * `author` alimente le registre ; « Import » est ignoré par le registre.
 */
export async function flush(state, author, { partial } = {}) {
  const ops = []
  for (const t of TABLES) {
    const prev = synced[t.collection] || new Map()
    const cur = state[t.collection] || []
    const ids = new Set()
    const upserts = []
    for (const o of cur) {
      ids.add(o.id)
      const c = canon(t, o)
      if (prev.get(o.id) !== c) upserts.push([o, c])
    }
    const deletes = [...prev.keys()].filter((id) => !ids.has(id))
    if (upserts.length || deletes.length) ops.push({ t, upserts, deletes })
  }
  const settingsChanged = state.settings && stable(state.settings) !== syncedSettings
  if (!ops.length && !settingsChanged) return false

  if (settingsChanged) {
    const snap = stable(state.settings)
    pendingSettings = snap
    const { error } = await supabase.from('app_settings').upsert({ id: 'main', data: state.settings, updated_at: new Date().toISOString() })
    pendingSettings = null
    if (error) throw dbError('app_settings', error)
    syncedSettings = snap
  }
  // Écritures parents → enfants
  for (const { t, upserts } of ops) {
    if (!upserts.length) continue
    for (let i = 0; i < upserts.length; i += 500) {
      const chunk = upserts.slice(i, i + 500)
      const rows = chunk.map(([o]) => toRow(t, o, author))
      // L'upsert exige aussi le droit d'insertion : avec des droits partiels (réponse à une
      // invitation…), les lignes déjà en base sont mises à jour une par une et la base tranche
      const known = synced[t.collection]
      const existing = known && chunk.every(([o]) => known.has(o.id))
      let { error } = existing && partial?.(t.collection) ? { error: { code: '42501' } } : await supabase.from(t.table).upsert(rows, { defaultToNull: false })
      if (error?.code === '42501' && existing) {
        error = null
        for (const { id, ...row } of rows) {
          // Une mise à jour filtrée par les règles d'accès ne touche aucune ligne, sans erreur
          const res = await supabase.from(t.table).update(row).eq('id', id).select('id')
          if (res.error || !res.data?.length) {
            error = res.error || { code: '42501', message: 'modification refusée par les règles d’accès' }
            break
          }
        }
      }
      if (error) throw dbError(t.table, error)
      const m = synced[t.collection] || (synced[t.collection] = new Map())
      chunk.forEach(([o, c]) => m.set(o.id, c))
    }
  }
  // Suppressions enfants → parents
  for (const { t, deletes } of [...ops].reverse()) {
    if (!deletes.length) continue
    for (let i = 0; i < deletes.length; i += 200) {
      const chunk = deletes.slice(i, i + 200)
      const { error } = await supabase.from(t.table).delete().in('id', chunk)
      if (error) throw dbError(t.table, error)
      chunk.forEach((id) => synced[t.collection]?.delete(id))
    }
  }
  return true
}

/**
 * Démarre la synchronisation : écritures différées après chaque modification du store
 * et application en direct des changements faits ailleurs (autre onglet, Studio, autre utilisateur).
 * apply(patch) applique un changement distant ; author() nomme l'auteur ; onDenied(e) traite un refus de droits.
 */
export function startSync(store, { onError, onDenied, partial, apply = (patch) => store.setState(patch), author = () => 'Utilisateur' } = {}) {
  let timer = null
  let running = false
  let pending = false
  let retryDelay = 2000

  const run = async () => {
    if (running) {
      pending = true
      return
    }
    running = true
    setStatus({ state: 'saving' })
    try {
      await flush(store.getState(), author(), { partial })
      retryDelay = 2000
      setStatus({ state: 'saved', error: null, savedAt: new Date() })
    } catch (e) {
      if ((isDenied(e) || isInvalid(e)) && onDenied) {
        // Pas de nouvel essai : la modification refusée est annulée en rechargeant la base
        setStatus({ state: 'saving' })
        await onDenied(e)
        setStatus({ state: 'saved', error: null, savedAt: new Date() })
        return
      }
      setStatus({ state: 'error', error: e.message || String(e) })
      onError?.(e)
      clearTimeout(timer)
      timer = setTimeout(run, retryDelay)
      retryDelay = Math.min(retryDelay * 2, 30000)
    } finally {
      running = false
      if (pending) {
        pending = false
        schedule()
      }
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(run, 250)
  }

  const unsub = store.subscribe((state, prev) => {
    if (state === prev) return
    if (COLLECTIONS.some((c) => state[c] !== prev[c]) || state.settings !== prev.settings) schedule()
  })

  const channel = supabase
    .channel('rentplan-db')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      if (payload.table === 'app_settings') {
        const data = payload.new?.data
        if (!data) return
        const merged = { ...DEFAULT_SETTINGS, ...data }
        const snap = stable(merged)
        // Écho de notre propre écriture, parfois reçu avant la fin de la requête
        if (snap === syncedSettings || snap === pendingSettings || snap === stable(store.getState().settings)) return
        syncedSettings = snap
        apply({ settings: merged })
        return
      }
      const t = byTable[payload.table]
      if (!t) return
      const list = store.getState()[t.collection] || []
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id
        if (!id) return
        synced[t.collection]?.delete(id)
        if (list.some((o) => o.id === id)) apply({ [t.collection]: list.filter((o) => o.id !== id) })
        return
      }
      const obj = fromRow(t, payload.new)
      const c = canon(t, obj)
      const m = synced[t.collection] || (synced[t.collection] = new Map())
      if (m.get(obj.id) === c) return // écho de notre propre écriture
      m.set(obj.id, c)
      const exists = list.some((o) => o.id === obj.id)
      apply({ [t.collection]: exists ? list.map((o) => (o.id === obj.id ? obj : o)) : [...list, obj] })
    })
    .subscribe()

  return {
    flushNow: run,
    stop() {
      unsub()
      clearTimeout(timer)
      supabase.removeChannel(channel)
    },
  }
}

/** Historique (onglet Registre) d'un projet. */
export async function fetchAuditLog(projectId) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('project_id', projectId)
    .order('at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data
}

/** Historique d'une table (ex. « bookings » pour le registre de suivi d'entrepôt). */
export async function fetchAuditByTable(table, limit = 300) {
  const { data, error } = await supabase.from('audit_log').select('*').eq('table_name', table).order('at', { ascending: false }).limit(limit)
  if (error) throw error
  return data
}

/** Envoi d'un fichier joint dans le bucket « fichiers ». */
export async function uploadFile(file, folder) {
  const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
  const { error } = await supabase.storage.from('fichiers').upload(path, file, { upsert: false })
  if (error) throw error
  return { path, url: supabase.storage.from('fichiers').getPublicUrl(path).data.publicUrl }
}

export const fileUrl = (path) => (supabase ? supabase.storage.from('fichiers').getPublicUrl(path).data.publicUrl : null)

/** Chemin dans le bucket d'une adresse publique de fichier (logo, fond d'en-tête…), sinon null. */
export const storagePathOf = (url) => {
  const m = /\/storage\/v1\/object\/public\/fichiers\/(.+)$/.exec(String(url || ''))
  return m ? decodeURIComponent(m[1].split('?')[0]) : null
}

/** Remise à zéro : les comptes ne sont plus liés à des fiches du personnel qui n'existent plus. */
export async function unlinkCrewAccounts() {
  if (!supabase) return
  const { error } = await supabase.from('profiles').update({ crew_id: null }).not('crew_id', 'is', null)
  if (error) throw error
}

/** Supprime des fichiers du bucket « fichiers » (les lignes de la table files sont gérées par le store). */
export async function removeStoredFiles(paths) {
  const list = [...new Set((paths || []).filter((p) => p && !p.startsWith('data:')))]
  if (!supabase || !list.length) return
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await supabase.storage.from('fichiers').remove(list.slice(i, i + 100))
    if (error) throw error
  }
}

export const collectionInfo = (c) => byCollection[c]
