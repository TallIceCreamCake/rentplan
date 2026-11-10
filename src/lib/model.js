import { addDays, byId, daysSpan, durationFactor, groupBy, hoursSpan, overlaps, parse, round2, startOfDay } from './utils'

// ---------- Statuts (identiques à Rentman) ----------
export const PROJECT_STATUSES = [
  { id: 'demande', label: 'Demande', color: '#8b5cf6', group: 'nonconf' },
  { id: 'concept', label: 'Concept', color: '#8a929c', group: 'nonconf' },
  { id: 'option', label: 'Option', color: '#f08c00', group: 'nonconf' },
  { id: 'confirme', label: 'Confirmé', color: '#19b26b', group: 'conf' },
  { id: 'pret', label: 'Prêt', color: '#1f87e5', group: 'conf' },
  { id: 'sur_site', label: 'Sur site', color: '#0e9f9a', group: 'conf' },
  { id: 'retourne', label: 'Retourné', color: '#5f6b7a', group: 'conf' },
  { id: 'annule', label: 'Annulé', color: '#e2284f', group: 'annule' },
]
export const STATUS_GROUPS = [
  { id: 'nonconf', label: 'Non confirmé' },
  { id: 'conf', label: 'Confirmé' },
  { id: 'annule', label: 'Annulé' },
]
export const statusOf = (id) => PROJECT_STATUSES.find((s) => s.id === id) || PROJECT_STATUSES[1]
export const isConfirmed = (s) => ['confirme', 'pret', 'sur_site', 'retourne'].includes(s)
/** Tous les statuts sauf Annulé retirent le matériel planifié de la disponibilité (le retourné est revenu en stock). */
export const subtractsAvailability = (s) => s !== 'annule' && s !== 'retourne'
/** Le matériel est réservé automatiquement à partir de Confirmé. */
export const autoReserved = (s) => ['confirme', 'pret', 'sur_site'].includes(s)

// finance : document financier (série de numéros, montants, visible avec « visibilité des finances »)
export const DOC_TYPES = {
  devis: { label: 'Devis', plural: 'Devis', finance: true, icon: 'description', group: 'finance' },
  contrat: { label: 'Contrat', plural: 'Contrats', finance: true, icon: 'history_edu', group: 'finance' },
  facture: { label: 'Facture', plural: 'Factures', finance: true, icon: 'receipt', group: 'finance' },
  avoir: { label: 'Note de crédit', plural: 'Notes de crédit', finance: true, icon: 'undo', group: 'finance' },
  preparation: { label: 'Bon de préparation', plural: 'Bons de préparation', prefix: 'BP', icon: 'inventory', group: 'logistique' },
  livraison: { label: 'Bon de livraison', plural: 'Bons de livraison', prefix: 'BL', icon: 'local_shipping', group: 'logistique' },
  feuille_route: { label: 'Feuille de route', plural: 'Feuilles de route', prefix: 'FR', icon: 'map', group: 'equipe' },
  autre: { label: 'Document', plural: 'Autres documents', prefix: 'DOC', icon: 'article', group: 'autre' },
  // standalone : imprimé depuis sa propre fiche (bon de commande, numéro de série), pas généré depuis un projet
  commande: { label: 'Bon de commande', plural: 'Bons de commande', icon: 'shopping_cart', group: 'achats', standalone: true },
  etiquette: { label: 'Étiquette', plural: 'Étiquettes', icon: 'qr_code_2', group: 'materiel', standalone: true },
}
export const DOC_GROUPS = [
  { id: 'finance', label: 'Finances' },
  { id: 'logistique', label: 'Logistique' },
  { id: 'equipe', label: 'Équipe' },
  { id: 'autre', label: 'Autres' },
  { id: 'achats', label: 'Achats' },
  { id: 'materiel', label: 'Matériel' },
]
export const isFinancialDoc = (docOrType) => Boolean(DOC_TYPES[typeof docOrType === 'string' ? docOrType : docOrType?.type]?.finance)
export const FINANCIAL_TYPES = Object.keys(DOC_TYPES).filter((k) => DOC_TYPES[k].finance)
export const QUOTE_STATUSES = [
  { id: 'brouillon', label: 'Brouillon', color: '#8a929c' },
  { id: 'envoye', label: 'Envoyé', color: '#1f87e5' },
  { id: 'accepte', label: 'Accepté', color: '#19b26b' },
  { id: 'refuse', label: 'Refusé', color: '#e2284f' },
  { id: 'expire', label: 'Expiré', color: '#f08c00' },
]
export const INVOICE_STATUSES = [
  { id: 'brouillon', label: 'Brouillon', color: '#8a929c' },
  { id: 'envoye', label: 'Envoyée', color: '#1f87e5' },
  { id: 'partiel', label: 'Partiellement payée', color: '#f08c00' },
  { id: 'payee', label: 'Payée', color: '#19b26b' },
  { id: 'annulee', label: 'Annulée', color: '#e2284f' },
]
export const OTHER_STATUSES = [
  { id: 'brouillon', label: 'Brouillon', color: '#8a929c' },
  { id: 'pret', label: 'Prêt', color: '#1f87e5' },
  { id: 'envoye', label: 'Envoyé', color: '#0e9f9a' },
  { id: 'signe', label: 'Signé', color: '#19b26b' },
]
export const PO_STATUSES = [
  { id: 'brouillon', label: 'Brouillon', color: '#8a929c' },
  { id: 'envoye', label: 'Envoyé', color: '#0e9f9a' },
  { id: 'confirme', label: 'Confirmé', color: '#1f87e5' },
  { id: 'recu', label: 'Reçu', color: '#19b26b' },
  { id: 'paye', label: 'Payé', color: '#5f6b7a' },
]
export const statusesOfType = (type) => (type === 'facture' || type === 'avoir' ? INVOICE_STATUSES : type === 'devis' || type === 'contrat' ? QUOTE_STATUSES : type === 'commande' ? PO_STATUSES : OTHER_STATUSES)
export const docStatusOf = (doc) => {
  const list = statusesOfType(doc.type)
  const s = list.find((x) => x.id === doc.status) || list[0]
  const late = doc.dueDate && parse(doc.dueDate) < startOfDay(new Date())
  if ((doc.type === 'facture') && ['envoye', 'partiel'].includes(doc.status) && late) return { id: 'retard', label: 'En retard', color: '#e2284f' }
  if ((doc.type === 'devis' || doc.type === 'contrat') && doc.status === 'envoye' && late) return { id: 'expire', label: 'Expiré', color: '#f08c00' }
  return s
}
export const paidAmount = (doc) => (doc.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)

export const FUNCTION_PRICE_TYPES = [
  { id: 'heure', label: 'par heure' },
  { id: 'jour', label: 'par jour' },
  { id: 'forfait', label: 'forfait' },
  { id: 'km', label: 'par km' },
]

// ---------- Index mémorisé ----------
let cacheKey = null
let cacheValue = null

/** Index de toutes les relations, recalculé uniquement quand une collection change. */
export function getIndex(d) {
  const key = [
    d.equipment, d.categories, d.contacts, d.contactPersons, d.crew, d.vehicles, d.projects, d.subprojects, d.periods,
    d.equipmentGroups, d.plannedEquipment, d.functionGroups, d.functions, d.assignments, d.costs, d.bookings, d.serials,
    d.repairs, d.subrents, d.documents, d.tasks, d.crewAvailability, d.settings, d.projectTypes, d.stockLocations, d.returnCharges,
    // Lues telles quelles via idx.d : sans elles, une modification resterait invisible jusqu'au prochain recalcul
    d.purchaseOrders, d.timeEntries, d.requests, d.notes, d.files, d.inspections, d.defaultFunctions, d.defaultCosts,
  ]
  if (cacheKey && key.every((v, i) => v === cacheKey[i])) return cacheValue
  cacheKey = key
  cacheValue = buildIndex(d)
  return cacheValue
}

function buildIndex(d) {
  const idx = {
    d,
    settings: d.settings,
    eq: byId(d.equipment),
    cat: byId(d.categories),
    contact: byId(d.contacts),
    person: byId(d.contactPersons),
    crew: byId(d.crew),
    vehicle: byId(d.vehicles),
    project: byId(d.projects),
    sub: byId(d.subprojects),
    period: byId(d.periods),
    group: byId(d.equipmentGroups),
    line: byId(d.plannedEquipment),
    fgroup: byId(d.functionGroups),
    fn: byId(d.functions),
    type: byId(d.projectTypes),
    location: byId(d.stockLocations),
    subsByProject: groupBy([...d.subprojects].sort((a, b) => a.sort - b.sort), 'projectId'),
    periodsByProject: groupBy([...d.periods].sort((a, b) => a.sort - b.sort), 'projectId'),
    groupsBySub: groupBy([...d.equipmentGroups].sort((a, b) => a.sort - b.sort), 'subprojectId'),
    linesBySub: groupBy([...d.plannedEquipment].sort((a, b) => a.sort - b.sort), 'subprojectId'),
    linesByGroup: groupBy([...d.plannedEquipment].sort((a, b) => a.sort - b.sort), 'groupId'),
    linesByEq: groupBy(d.plannedEquipment, 'equipmentId'),
    fgroupsBySub: groupBy([...d.functionGroups].sort((a, b) => a.sort - b.sort), 'subprojectId'),
    fnsBySub: groupBy([...d.functions].sort((a, b) => a.sort - b.sort), 'subprojectId'),
    asgByFn: groupBy(d.assignments, 'functionId'),
    asgByCrew: groupBy(d.assignments, 'crewId'),
    asgByVehicle: groupBy(d.assignments, 'vehicleId'),
    costsBySub: groupBy([...d.costs].sort((a, b) => a.sort - b.sort), 'subprojectId'),
    bookingsBySub: groupBy(d.bookings, 'subprojectId'),
    chargesBySub: groupBy(d.returnCharges || [], 'subprojectId'),
    serialsByEq: groupBy(d.serials, 'equipmentId'),
    docsByProject: groupBy(d.documents, 'projectId'),
    tasksByProject: groupBy(d.tasks, 'projectId'),
    availByCrew: groupBy(d.crewAvailability, 'crewId'),
    personsByContact: groupBy(d.contactPersons, 'contactId'),
  }
  idx.events = buildEquipmentEvents(idx, d)
  return idx
}

// ---------- Horaires ----------
const pick = (period, start, end) => (period ? [period.startsAt, period.endsAt] : [start, end])

export function groupTimes(g, idx) {
  if (!g) return {}
  const [planStart, planEnd] = pick(idx.period[g.planningPeriodId], g.planStart, g.planEnd)
  const [useStart, useEnd] = pick(idx.period[g.usagePeriodId], g.useStart, g.useEnd)
  return { planStart, planEnd, useStart: useStart || planStart, useEnd: useEnd || planEnd }
}

export function functionTimes(f, idx) {
  if (!f) return {}
  const grp = idx.fgroup[f.groupId]
  const resolve = (periodId, start, end, groupPeriodId) => {
    if (periodId && idx.period[periodId]) return [idx.period[periodId].startsAt, idx.period[periodId].endsAt]
    if (start) return [start, end]
    if (groupPeriodId && idx.period[groupPeriodId]) return [idx.period[groupPeriodId].startsAt, idx.period[groupPeriodId].endsAt]
    return [null, null]
  }
  const [planStart, planEnd] = resolve(f.planningPeriodId, f.planStart, f.planEnd, grp?.planningPeriodId)
  const [useStart, useEnd] = resolve(f.usagePeriodId, f.useStart, f.useEnd, grp?.usagePeriodId)
  return { planStart: planStart || useStart, planEnd: planEnd || useEnd, useStart: useStart || planStart, useEnd: useEnd || planEnd }
}

/**
 * Créneaux d'une affectation : ceux saisis (plusieurs horaires, plusieurs jours), sinon un seul créneau
 * (horaires propres de l'affectation ou ceux de la fonction).
 */
export function assignmentSlots(a, idx) {
  if (a.shifts?.length) return a.shifts.filter((s) => s.start && s.end).sort((x, y) => String(x.start).localeCompare(String(y.start)))
  const t = functionTimes(idx.fn[a.functionId], idx)
  const start = a.planStart || t.planStart
  const end = a.planEnd || t.planEnd
  return start && end ? [{ id: 'principal', start, end }] : []
}

/** Étendue d'une affectation (du premier au dernier créneau). */
export function assignmentTimes(a, idx) {
  if (a.shifts?.length) {
    const slots = assignmentSlots(a, idx)
    return { start: slots[0]?.start || null, end: slots.reduce((m, s) => (!m || s.end > m ? s.end : m), null), slots }
  }
  const t = functionTimes(idx.fn[a.functionId], idx)
  return { start: a.planStart || t.planStart, end: a.planEnd || t.planEnd }
}

/** Heures planifiées d'une affectation (pause de la fonction retirée à chaque créneau). */
export function assignmentHours(a, idx) {
  const f = idx.fn[a.functionId]
  return assignmentSlots(a, idx).reduce((h, s) => h + billableHours(s.start, s.end, f?.breakMinutes), 0)
}

/**
 * Découpe une période en créneaux d'un jour aux mêmes horaires (07:00–20:00 chaque jour) ; une période de moins
 * de 24 h reste un seul créneau, une nuit (22:00–02:00) se termine le lendemain.
 */
export function dailySlots(start, end) {
  const s = parse(start)
  const e = parse(end)
  if (!s || !e || e <= s) return []
  if (e - s <= 24 * 3600000) return [{ start, end }]
  const hm = (d) => d.getHours() * 60 + d.getMinutes()
  const overnight = hm(e) <= hm(s)
  const lastDay = startOfDay(overnight ? addDays(e, -1) : e)
  const out = []
  for (let d = startOfDay(s); d <= lastDay; d = addDays(d, 1)) {
    const a = new Date(d)
    a.setHours(s.getHours(), s.getMinutes(), 0, 0)
    const b = addDays(new Date(d), overnight ? 1 : 0)
    b.setHours(e.getHours(), e.getMinutes(), 0, 0)
    out.push({ start: localInput(a), end: localInput(b) })
  }
  return out
}
const localInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Périodes par défaut d'un (sous-)projet : celles du sous-projet si elles existent, sinon celles du projet. */
export function defaultPeriods(projectId, subprojectId, idx) {
  const all = idx.periodsByProject[projectId] || []
  const own = all.filter((p) => p.subprojectId === subprojectId)
  const base = own.some((p) => p.isPlanning) ? own : all.filter((p) => !p.subprojectId)
  return { planning: base.find((p) => p.isPlanning) || base[0], usage: base.find((p) => p.isUsage) || base[0] }
}

/** Fenêtre de planification d'un sous-projet (union de ses groupes et fonctions). */
export function subTimes(subId, idx) {
  const sub = idx.sub[subId]
  if (!sub) return {}
  let planStart = null
  let planEnd = null
  let useStart = null
  let useEnd = null
  const widen = (t) => {
    if (t.planStart && (!planStart || t.planStart < planStart)) planStart = t.planStart
    if (t.planEnd && (!planEnd || t.planEnd > planEnd)) planEnd = t.planEnd
    if (t.useStart && (!useStart || t.useStart < useStart)) useStart = t.useStart
    if (t.useEnd && (!useEnd || t.useEnd > useEnd)) useEnd = t.useEnd
  }
  for (const g of idx.groupsBySub[subId] || []) widen(groupTimes(g, idx))
  for (const f of idx.fnsBySub[subId] || []) widen(functionTimes(f, idx))
  if (!planStart) {
    const { planning, usage } = defaultPeriods(sub.projectId, subId, idx)
    widen({ planStart: planning?.startsAt, planEnd: planning?.endsAt, useStart: usage?.startsAt, useEnd: usage?.endsAt })
  }
  return { planStart, planEnd, useStart: useStart || planStart, useEnd: useEnd || planEnd }
}

export function projectTimes(projectId, idx) {
  let planStart = null
  let planEnd = null
  let useStart = null
  let useEnd = null
  for (const s of idx.subsByProject[projectId] || []) {
    const t = subTimes(s.id, idx)
    if (t.planStart && (!planStart || t.planStart < planStart)) planStart = t.planStart
    if (t.planEnd && (!planEnd || t.planEnd > planEnd)) planEnd = t.planEnd
    if (t.useStart && (!useStart || t.useStart < useStart)) useStart = t.useStart
    if (t.useEnd && (!useEnd || t.useEnd > useEnd)) useEnd = t.useEnd
  }
  return { planStart, planEnd, useStart, useEnd }
}

/** Statut affiché pour un projet : celui de ses sous-projets, ou « varie ». */
export function projectStatus(projectId, idx) {
  const all = idx.subsByProject[projectId] || []
  const kept = all.filter((s) => s.proposal?.state !== 'ecartee')
  const subs = kept.length ? kept : all
  const set = [...new Set(subs.map((s) => s.status))]
  if (set.length === 1) return { id: set[0], mixed: false }
  const active = subs.filter((s) => s.status !== 'annule')
  return { id: active[0]?.status || subs[0]?.status || 'concept', mixed: true }
}

// ---------- Disponibilité du matériel ----------
// Stock d'un article sur une période = stock propre + sous-locations − (projets, réparations, matériel pas encore
// rentré) au moment le plus chargé. Le matériel déclaré perdu à l'entrepôt est retiré du stock lui-même ; les articles
// de vente sont réservés par les projets en cours puis déduits du stock quand le projet passe à « Retourné ».
const FAR = new Date(2100, 0, 1)
/** Statuts de sous-location qui ajoutent du stock (annulée ou rendue au fournisseur : non). */
export const SUBRENT_COUNTS = ['demande', 'confirme', 'recu']

/** Une ligne planifiée consomme-t-elle du stock de location ? (les kits se décomposent en leur contenu, les cases sont comptés entiers) */
export function lineConsumes(line, idx) {
  const eq = idx.eq[line.equipmentId]
  if (!eq || eq.kind === 'vente' || line.isOptional) return false
  if (eq.type === 'kit') return false
  if (line.relation === 'contenu') {
    const parent = idx.line[line.parentId]
    if (parent && idx.eq[parent.equipmentId]?.type === 'case') return false
  }
  return true
}

/** Une ligne de vente réserve-t-elle du stock ? (projet ni annulé ni retourné : au retour, le stock est déduit) */
export function saleLineReserves(line, idx) {
  const eq = idx.eq[line.equipmentId]
  const sub = idx.sub[line.subprojectId]
  return !!eq && eq.kind === 'vente' && !line.isOptional && !!sub && sub.status !== 'annule' && sub.status !== 'retourne'
}

function buildEquipmentEvents(idx, d) {
  const ev = {}
  const push = (eqId, e) => (ev[eqId] ||= []).push(e)
  const now = new Date()
  // Propositions ouvertes d'un même jeu : une seule sera retenue, chaque article ne compte que pour la proposition
  // qui en demande le plus (et non pour la somme des propositions)
  const heaviest = new Map()
  const sizes = new Map()
  for (const line of d.plannedEquipment) {
    const sub = idx.sub[line.subprojectId]
    if (!sub?.proposal?.set || sub.proposal.state !== 'ouverte' || !lineConsumes(line, idx)) continue
    const key = `${sub.proposal.set}|${line.equipmentId}`
    const k2 = `${key}|${sub.id}`
    sizes.set(k2, (sizes.get(k2) || 0) + (Number(line.quantity) || 0))
    const best = heaviest.get(key)
    if (!best || sizes.get(k2) > best.qty) heaviest.set(key, { sub: sub.id, qty: sizes.get(k2) })
  }
  for (const line of d.plannedEquipment) {
    const sub = idx.sub[line.subprojectId]
    if (!sub || !subtractsAvailability(sub.status) || !lineConsumes(line, idx)) continue
    if (sub.proposal?.state === 'ouverte' && heaviest.get(`${sub.proposal.set}|${line.equipmentId}`)?.sub !== sub.id) continue
    const t = groupTimes(idx.group[line.groupId], idx)
    if (!t.planStart || !t.planEnd) continue
    push(line.equipmentId, { s: parse(t.planStart), e: parse(t.planEnd), qty: Number(line.quantity) || 0, subId: line.subprojectId, kind: 'projet' })
  }
  // Entrepôt : le matériel encore sur site après la fin de la planification reste indisponible jusqu'à son retour
  for (const b of d.bookings || []) {
    const sub = idx.sub[b.subprojectId]
    const eq = idx.eq[b.equipmentId]
    const out = Number(b.surSite) || 0
    if (!out || !sub || !eq || eq.kind === 'vente' || eq.type === 'kit' || sub.status === 'annule' || sub.status === 'retourne') continue
    const end = parse(subTimes(sub.id, idx).planEnd)
    if (end && end < now) push(eq.id, { s: end, e: FAR, qty: out, subId: sub.id, kind: 'non_rendu' })
  }
  for (const r of d.repairs) {
    if (!r.equipmentId || !r.unavailable || r.status !== 'en_cours') continue
    push(r.equipmentId, { s: parse(r.startsAt) || new Date(2000, 0, 1), e: parse(r.endsAt) || FAR, qty: Number(r.quantity) || 1, kind: 'reparation' })
  }
  // Sous-locations demandées, confirmées ou reçues : du stock en plus sur leur période (une demande reste « à confirmer »)
  for (const sr of d.subrents) {
    if (!SUBRENT_COUNTS.includes(sr.status) || !sr.startsAt || !sr.endsAt) continue
    for (const l of sr.lines || []) {
      push(l.equipmentId, { s: parse(sr.startsAt), e: parse(sr.endsAt), qty: -(Number(l.quantity) || 0), kind: 'souslocation', subrentId: sr.id, pending: sr.status === 'demande' })
    }
  }
  return ev
}

/** Stock propre (articles sérialisés : numéros hors service et perdus exclus). */
export function stockOf(eq, idx) {
  if (!eq) return 0
  if (eq.serialized) return (idx.serialsByEq[eq.id] || []).filter((s) => s.status !== 'hs' && s.status !== 'perdu').length
  return Number(eq.stock) || 0
}

/**
 * Pic d'une liste d'événements sur une fenêtre : la quantité nette au moment le plus chargé.
 * Les sous-locations (quantités négatives) peuvent la rendre négative : du stock en plus sur toute la fenêtre.
 */
export function peakOf(events, s0, e0) {
  const points = []
  for (const e of events) {
    if (!overlaps(e.s, e.e, s0, e0)) continue
    points.push([Math.max(e.s, s0), e.qty], [Math.min(e.e, e0), -e.qty])
  }
  points.sort((a, b) => a[0] - b[0])
  // Rien au début de la fenêtre : la quantité y est nulle
  let max = !points.length || points[0][0] > s0 ? 0 : -Infinity
  let cur = 0
  for (let i = 0; i < points.length; ) {
    // Tous les changements d'un même instant d'abord : deux locations qui se suivent ne se chevauchent pas
    const t = points[i][0]
    while (i < points.length && points[i][0] === t) cur += points[i++][1]
    if (t < e0 && cur > max) max = cur
  }
  return max === -Infinity ? 0 : max
}

const windowOf = (start, end) => [start instanceof Date ? start : parse(start), end instanceof Date ? end : parse(end)]

/** Pic d'utilisation nette (projets + réparations + non rendu − sous-locations) ; firm : sans les sous-locations à confirmer. */
export function peakUsage(idx, eqId, start, end, excludeSubId, firm = false) {
  const [s0, e0] = windowOf(start, end)
  return peakOf((idx.events[eqId] || []).filter((e) => !(e.subId && e.subId === excludeSubId) && !(firm && e.pending)), s0, e0)
}

const subStartOf = (idx, subId) => subTimes(subId, idx).planStart || ''

/**
 * Stock de vente disponible. Sans sous-projet : stock moins tout ce que les projets en cours réservent.
 * Pour un sous-projet : les projets qui commencent avant lui sont servis en premier.
 */
function saleAvailable(idx, eq, excludeSubId) {
  const before = excludeSubId ? subStartOf(idx, excludeSubId) : null
  let reserved = 0
  for (const l of idx.linesByEq[eq.id] || []) {
    if (!saleLineReserves(l, idx)) continue
    if (excludeSubId) {
      if (l.subprojectId === excludeSubId) continue
      const st = subStartOf(idx, l.subprojectId)
      if (st > before || (st === before && l.subprojectId > excludeSubId)) continue
    }
    reserved += Number(l.quantity) || 0
  }
  return stockOf(eq, idx) - reserved
}

/**
 * Quantité disponible sur une période. excludeSubId : sans compter ce sous-projet (pour savoir s'il est servi) ;
 * sans lui, ce qu'il reste une fois tous les projets servis (liste des équipements d'un projet, recherche…).
 */
export function available(idx, eqId, start, end, excludeSubId, firm = false) {
  const eq = idx.eq[eqId]
  if (!eq) return 0
  if (eq.kind === 'vente') return saleAvailable(idx, eq, excludeSubId)
  if (eq.type === 'kit') {
    // Combinaison virtuelle : limitée par son contenu
    const parts = (eq.contents || []).map((c) => Math.floor(available(idx, c.equipmentId, start, end, excludeSubId, firm) / (c.quantity || 1)))
    return parts.length ? Math.min(...parts) : 0
  }
  if (!start || !end) return stockOf(eq, idx)
  return stockOf(eq, idx) - peakUsage(idx, eqId, start, end, excludeSubId, firm)
}

/** Quantité planifiée d'un article dans un sous-projet (contenu des kits compris, options exclues). */
export function plannedInSub(idx, subId, eqId) {
  let n = 0
  for (const l of idx.linesBySub[subId] || []) if (l.equipmentId === eqId && !l.isOptional) n += Number(l.quantity) || 0
  return n
}

/**
 * Situation du stock d'un article sur une période, vue depuis un sous-projet : stock, sous-locations, réparations,
 * matériel non rendu, autres projets, quantité planifiée ici et ce qu'il reste.
 */
export function stockSituation(idx, eqId, start, end, subId) {
  const eq = idx.eq[eqId]
  if (!eq) return null
  const here = subId ? plannedInSub(idx, subId, eqId) : 0
  const remaining = available(idx, eqId, start, end)
  const base = { eq, here, remaining, forSub: subId ? available(idx, eqId, start, end, subId) : remaining }
  if (eq.type === 'kit') return { ...base, kit: true }
  const stock = stockOf(eq, idx)
  if (eq.kind === 'vente') return { ...base, sale: true, stock, others: stock - here - remaining }
  // Sans période, seul ce sous-projet est connu
  if (!start || !end) return { ...base, remaining: stock - here, forSub: stock, stock, others: 0, repairs: 0, late: 0, subrented: 0 }
  const [s0, e0] = windowOf(start, end)
  const list = idx.events[eqId] || []
  const peak = (kind, own = false, only = () => true) => peakOf(list.filter((e) => e.kind === kind && (own || e.subId !== subId) && only(e)).map((e) => ({ ...e, qty: Math.abs(e.qty) })), s0, e0)
  // Sous-location : la quantité garantie sur toute la période (pas seulement au meilleur moment)
  const firm = (kind, onlyPending) => -peakOf(list.filter((e) => e.kind === kind && (!onlyPending || e.pending)), s0, e0)
  return { ...base, stock, others: peak('projet'), repairs: peak('reparation'), late: peak('non_rendu', true), subrented: Math.max(0, firm('souslocation')), subrentPending: Math.max(0, firm('souslocation', true)) }
}

/** Disponibilité jour par jour (chronologies). */
export function dailyAvailability(idx, eqId, days, excludeSubId) {
  return days.map((d) => available(idx, eqId, startOfDay(d), addDays(startOfDay(d), 1), excludeSubId))
}

/** Matériel d'un sous-projet agrégé par article, avec la quantité disponible pour lui sur sa période. */
export function subEquipmentStatus(subId, idx) {
  const map = {}
  for (const line of idx.linesBySub[subId] || []) {
    const eq = idx.eq[line.equipmentId]
    const sale = eq?.kind === 'vente' && !line.isOptional
    if (!line.equipmentId || (!lineConsumes(line, idx) && !sale)) continue
    const t = groupTimes(idx.group[line.groupId], idx)
    const m = (map[line.equipmentId] ||= { equipmentId: line.equipmentId, needed: 0, start: t.planStart, end: t.planEnd, sale })
    m.needed += Number(line.quantity) || 0
    if (t.planStart && (!m.start || t.planStart < m.start)) m.start = t.planStart
    if (t.planEnd && (!m.end || t.planEnd > m.end)) m.end = t.planEnd
  }
  return Object.values(map).map((m) => {
    const avail = m.sale ? available(idx, m.equipmentId, null, null, subId) : m.start && m.end ? available(idx, m.equipmentId, m.start, m.end, subId) : 0
    const shortage = Math.max(0, m.needed - Math.max(0, avail))
    // Servi grâce à une sous-location encore « demandée » : à confirmer auprès du fournisseur
    const firm = !m.sale && !shortage && m.start && m.end ? available(idx, m.equipmentId, m.start, m.end, subId, true) : avail
    return { ...m, available: avail, shortage, pendingSubrent: !shortage && m.needed > Math.max(0, firm) ? m.needed - Math.max(0, firm) : 0 }
  })
}

/** Pénuries de location d'un sous-projet (celles de vente sont suivies à part). */
export function subShortages(subId, idx) {
  const sub = idx.sub[subId]
  if (!sub || !subtractsAvailability(sub.status)) return []
  return subEquipmentStatus(subId, idx).filter((x) => x.shortage > 0 && !x.sale)
}

export function projectShortages(projectId, idx) {
  return (idx.subsByProject[projectId] || []).flatMap((s) => subShortages(s.id, idx).map((x) => ({ ...x, subId: s.id })))
}

// ---------- Prix ----------
export const factorFor = (days, settings) => durationFactor(days, settings?.staffel, settings?.staffelExtra)

export function lineUnitPrice(line, eq) {
  if (line.price != null) return Number(line.price)
  if (line.relation !== 'principal') return 0
  return Number(eq?.rentalPrice) || 0
}

export function lineFactor(line, idx) {
  const eq = idx.eq[line.equipmentId]
  if (eq?.kind === 'vente') return 1
  const t = groupTimes(idx.group[line.groupId], idx)
  return factorFor(daysSpan(t.useStart, t.useEnd), idx.settings)
}

export function lineTotal(line, idx) {
  const eq = idx.eq[line.equipmentId]
  if (line.isOptional) return 0
  return round2((Number(line.quantity) || 0) * lineUnitPrice(line, eq) * lineFactor(line, idx) * (1 - (Number(line.discount) || 0) / 100))
}

const billableHours = (start, end, breakMin) => Math.max(0, hoursSpan(start, end) - (Number(breakMin) || 0) / 60)

function amount(type, rate, qty, start, end, breakMin, km) {
  const r = Number(rate) || 0
  if (type === 'heure') return billableHours(start, end, breakMin) * r * qty
  if (type === 'jour') return daysSpan(start, end) * r * qty
  if (type === 'km') return (Number(km) || 0) * r * qty
  return r * qty
}

/** Prix facturé d'une fonction (période d'utilisation). */
export function functionPrice(f, idx) {
  const t = functionTimes(f, idx)
  return round2(amount(f.priceType, f.price, f.quantity || 1, t.useStart, t.useEnd, f.breakMinutes, f.distanceKm))
}

/** Coût estimé d'une fonction (période de planification). */
export function functionCost(f, idx) {
  const t = functionTimes(f, idx)
  return round2(amount(f.costType, f.cost, f.quantity || 1, t.planStart, t.planEnd, f.breakMinutes, f.distanceKm))
}

/** Coût prévu d'une affectation (tarif du membre ou du véhicule). */
export function assignmentCost(a, idx) {
  const f = idx.fn[a.functionId]
  if (!f) return 0
  if (a.vehicleId) {
    const v = idx.vehicle[a.vehicleId]
    // Jours d'utilisation du véhicule : ceux couverts par ses créneaux (sans doublon), trajet compté par créneau
    const days = new Set()
    const slots = assignmentSlots(a, idx)
    for (const s of slots) for (let d = startOfDay(parse(s.start)); d <= parse(s.end); d = addDays(d, 1)) days.add(d.getTime())
    return round2(days.size * (Number(v?.dayRate) || 0) + Math.max(1, slots.length) * (Number(f.distanceKm) || 0) * (Number(v?.costPerKm) || 0))
  }
  const rate = a.rate ?? idx.crew[a.crewId]?.costRate ?? f.cost
  return round2(assignmentHours(a, idx) * (Number(rate) || 0))
}

export const FIN_CATEGORIES = [
  { id: 'location', label: 'Location' },
  { id: 'vente', label: 'Vente' },
  { id: 'personnel', label: 'Personnel' },
  { id: 'transport', label: 'Transport' },
  { id: 'autres', label: 'Autres' },
]

/** Synthèse financière d'un sous-projet (colonnes de l'onglet Finances de Rentman). */
export function subTotals(subId, idx) {
  const sub = idx.sub[subId]
  const rows = Object.fromEntries(FIN_CATEGORIES.map((c) => [c.id, { revenue: 0, estimated: 0, planned: 0, actual: 0 }]))
  let weight = 0
  let volume = 0
  let power = 0
  let rentalGross = 0
  for (const line of idx.linesBySub[subId] || []) {
    const eq = idx.eq[line.equipmentId]
    const qty = Number(line.quantity) || 0
    if (lineConsumes(line, idx) || eq?.kind === 'vente') {
      weight += (Number(eq?.weight) || 0) * qty
      volume += (Number(eq?.volume) || 0) * qty
      power += (Number(eq?.power) || 0) * qty
    }
    const total = lineTotal(line, idx)
    if (eq?.kind === 'vente') {
      rows.vente.revenue += total
      const c = (Number(eq.purchasePrice) || 0) * qty
      rows.vente.estimated += c
      rows.vente.planned += c
      rows.vente.actual += c
    } else {
      rows.location.revenue += total
      rentalGross += total
    }
  }
  for (const f of idx.fnsBySub[subId] || []) {
    const cat = f.kind === 'transport' ? rows.transport : rows.personnel
    cat.revenue += functionPrice(f, idx)
    const est = functionCost(f, idx)
    cat.estimated += est
    const asg = idx.asgByFn[f.id] || []
    const planned = asg.reduce((s, a) => s + assignmentCost(a, idx), 0)
    // Les postes non pourvus restent estimés au coût de la fonction
    const missing = Math.max(0, (f.quantity || 1) - asg.length)
    cat.planned += planned + (est / (f.quantity || 1)) * missing
    cat.actual += planned
  }
  for (const c of idx.costsBySub[subId] || []) {
    const q = Number(c.quantity) || 0
    rows.autres.revenue += q * (Number(c.price) || 0) * (1 - (Number(c.discount) || 0) / 100)
    const cost = q * (Number(c.cost) || 0)
    rows.autres.estimated += cost
    rows.autres.planned += cost
    rows.autres.actual += cost
  }
  const discounts = sub?.discounts || {}
  let subtotal = 0
  let costTotal = 0
  for (const c of FIN_CATEGORIES) {
    const r = rows[c.id]
    r.discount = Number(discounts[c.id]) || 0
    r.total = round2(r.revenue * (1 - r.discount / 100))
    r.profit = round2(r.total - r.planned)
    subtotal += r.total
    costTotal += r.planned
  }
  const insurance = round2(rentalGross * ((Number(sub?.insurancePct) || 0) / 100))
  subtotal += insurance
  const discountTotal = round2(subtotal * ((Number(sub?.discountTotal) || 0) / 100))
  const computed = round2(subtotal - discountTotal)
  const totalExVat = sub?.lockedTotal != null ? Number(sub.lockedTotal) : computed
  const vatRate = Number(idx.settings?.vatRate) || 0
  const vat = round2(totalExVat * (vatRate / 100))
  return {
    rows,
    insurance,
    subtotal: round2(subtotal),
    discountTotal,
    computed,
    locked: sub?.lockedTotal != null,
    totalExVat: round2(totalExVat),
    vatRate,
    vat,
    total: round2(totalExVat + vat),
    costTotal: round2(costTotal),
    profit: round2(totalExVat - costTotal),
    weight: round2(weight),
    volume: round2(volume),
    power: round2(power),
  }
}

/** Totaux d'un projet : somme des sous-projets non annulés. */
/**
 * Sous-projets comptés dans les totaux du projet : les écartés (annulés) non, et pour des propositions encore
 * ouvertes une seule par jeu (la première, A) — elles sont des alternatives, pas des ajouts.
 */
export function countedSubs(projectId, idx) {
  const seen = new Set()
  const subs = [...(idx.subsByProject[projectId] || [])].sort((a, b) => String(a.proposal?.label || '').localeCompare(String(b.proposal?.label || ''), 'fr', { numeric: true }) || a.sort - b.sort)
  return subs.filter((s) => {
    if (s.status === 'annule') return false
    const set = s.proposal?.set
    if (!set) return true
    if (seen.has(set)) return false
    seen.add(set)
    return true
  })
}

export function projectTotals(projectId, idx) {
  const subs = countedSubs(projectId, idx)
  const acc = { totalExVat: 0, vat: 0, total: 0, costTotal: 0, profit: 0, weight: 0, volume: 0, power: 0, rows: {} }
  for (const c of FIN_CATEGORIES) acc.rows[c.id] = { revenue: 0, estimated: 0, planned: 0, actual: 0, total: 0, profit: 0 }
  for (const s of subs) {
    const t = subTotals(s.id, idx)
    for (const k of ['totalExVat', 'vat', 'total', 'costTotal', 'profit', 'weight', 'volume', 'power']) acc[k] = round2(acc[k] + t[k])
    for (const c of FIN_CATEGORIES) for (const k of Object.keys(acc.rows[c.id])) acc.rows[c.id][k] = round2(acc.rows[c.id][k] + (t.rows[c.id][k] || 0))
  }
  return acc
}

// ---------- Équipe ----------
export function crewBusy(idx, crewId, start, end, excludeAssignmentId, ignoreSubIds) {
  if (!crewId || !start || !end) return null
  const s = parse(start)
  const e = parse(end)
  for (const a of idx.asgByCrew[crewId] || []) {
    if (a.id === excludeAssignmentId || ignoreSubIds?.includes(a.subprojectId)) continue
    const sub = idx.sub[a.subprojectId]
    if (!sub || sub.status === 'annule') continue
    for (const t of assignmentSlots(a, idx)) if (overlaps(parse(t.start), parse(t.end), s, e)) return { assignment: a, project: idx.project[a.projectId], slot: t }
  }
  for (const u of idx.availByCrew[crewId] || []) {
    if (u.kind === 'disponible' || (u.kind === 'conge' && u.status !== 'approuve')) continue
    if (overlaps(parse(u.startsAt), parse(u.endsAt), s, e)) return { unavailable: u }
  }
  return null
}

export function vehicleBusy(idx, vehicleId, start, end, excludeAssignmentId, ignoreSubIds) {
  if (!vehicleId || !start || !end) return null
  for (const a of idx.asgByVehicle[vehicleId] || []) {
    if (a.id === excludeAssignmentId || ignoreSubIds?.includes(a.subprojectId)) continue
    const sub = idx.sub[a.subprojectId]
    if (!sub || sub.status === 'annule') continue
    for (const t of assignmentSlots(a, idx)) if (overlaps(parse(t.start), parse(t.end), parse(start), parse(end))) return { assignment: a, project: idx.project[a.projectId], slot: t }
  }
  return null
}

/**
 * Jours de la fonction où une personne (ou un véhicule) est libre : la période est découpée en créneaux d'un jour
 * et chacun est comparé à ses autres plannings et indisponibilités.
 */
export function freeDays(idx, kind, resourceId, start, end, excludeAssignmentId, ignoreSubIds) {
  const slots = dailySlots(start, end)
  const busy = kind === 'vehicule' ? vehicleBusy : crewBusy
  const free = slots.filter((sl) => !busy(idx, resourceId, sl.start, sl.end, excludeAssignmentId, ignoreSubIds))
  return { slots, free }
}

export function crewConflicts(idx) {
  const out = []
  for (const [crewId, list] of Object.entries(idx.asgByCrew)) {
    // Chaque créneau compte : deux créneaux d'une même affectation ne sont pas un conflit
    const items = list
      .filter((a) => idx.sub[a.subprojectId]?.status !== 'annule')
      .flatMap((a) => assignmentSlots(a, idx).map((t) => ({ a, ...t })))
    const seen = new Set()
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].a.id === items[j].a.id) continue
        // Propositions d'un même jeu : alternatives, jamais réalisées ensemble
        const pi = idx.sub[items[i].a.subprojectId]?.proposal
        const pj = idx.sub[items[j].a.subprojectId]?.proposal
        if (pi?.set && pi.set === pj?.set && items[i].a.subprojectId !== items[j].a.subprojectId) continue
        const key = [items[i].a.id, items[j].a.id].sort().join('|')
        if (seen.has(key)) continue
        if (overlaps(parse(items[i].start), parse(items[i].end), parse(items[j].start), parse(items[j].end))) {
          seen.add(key)
          out.push({ crewId, a: items[i].a, b: items[j].a })
        }
      }
  }
  return out
}

/** Postes : (pourvus / requis) d'une fonction. */
export function functionFill(f, idx) {
  const n = (idx.asgByFn[f.id] || []).length
  return { planned: n, needed: f.quantity || 1, full: n >= (f.quantity || 1) }
}

// ---------- Avancée du projet (5 icônes de la liste des projets) ----------
export function projectProgress(projectId, idx) {
  const subs = idx.subsByProject[projectId] || []
  const lines = subs.flatMap((s) => idx.linesBySub[s.id] || [])
  const shortages = projectShortages(projectId, idx)
  const status = projectStatus(projectId, idx).id
  const equipment = !lines.length ? 'none' : shortages.length ? 'bad' : autoReserved(status) || status === 'retourne' ? 'ok' : 'warn'
  const fns = subs.flatMap((s) => idx.fnsBySub[s.id] || [])
  const crew = !fns.length ? 'none' : fns.every((f) => functionFill(f, idx).full) ? 'ok' : isConfirmed(status) ? 'bad' : 'warn'
  const docs = idx.docsByProject[projectId] || []
  const quotes = docs.filter((d) => d.type === 'devis' || d.type === 'contrat')
  const quote = isConfirmed(status) ? 'ok' : quotes.some((q) => q.status === 'envoye') ? 'warn' : quotes.length ? 'warn' : 'none'
  const invoices = docs.filter((d) => d.type === 'facture' && d.status !== 'annulee')
  const invoice = !invoices.length ? (isConfirmed(status) ? 'warn' : 'none') : invoices.every((i) => i.status === 'payee') ? 'ok' : invoices.some((i) => docStatusOf(i).id === 'retard') ? 'bad' : 'warn'
  const tasks = idx.tasksByProject[projectId] || []
  const task = !tasks.length ? 'none' : tasks.every((t) => t.status === 'termine') ? 'ok' : 'warn'
  return { equipment, crew, quote, invoice, task, shortages }
}

// ---------- Entrepôt ----------
/** Quantités par statut d'entrepôt pour un sous-projet (agrégées par article). */
export function subWarehouse(subId, idx) {
  const needed = {}
  for (const line of idx.linesBySub[subId] || []) {
    const eq = idx.eq[line.equipmentId]
    if (!eq || eq.type === 'kit' || line.isOptional) continue
    if (line.relation === 'contenu' && idx.eq[idx.line[line.parentId]?.equipmentId]?.type === 'case') continue
    needed[eq.id] = (needed[eq.id] || 0) + (Number(line.quantity) || 0)
  }
  const bookings = Object.fromEntries((idx.bookingsBySub[subId] || []).map((b) => [b.equipmentId, b]))
  const rows = Object.entries(needed).map(([equipmentId, qty]) => {
    const b = bookings[equipmentId] || {}
    const pret = Number(b.pret) || 0
    const surSite = Number(b.surSite) || 0
    const retourne = Number(b.retourne) || 0
    const perdu = Number(b.perdu) || 0
    return { equipmentId, needed: qty, pret, surSite, retourne, perdu, aPreparer: Math.max(0, qty - pret - surSite - retourne - perdu), booking: b }
  })
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0)
  return { rows, totals: { needed: sum('needed'), aPreparer: sum('aPreparer'), pret: sum('pret'), surSite: sum('surSite'), retourne: sum('retourne'), perdu: sum('perdu') } }
}

/** Colonne de l'aperçu Box pour un sous-projet à une date donnée. */
export function warehouseColumn(sub, idx, day) {
  const t = subTimes(sub.id, idx)
  if (!t.planStart) return null
  const d0 = startOfDay(day)
  const d1 = addDays(d0, 1)
  const ps = parse(t.planStart)
  const pe = parse(t.planEnd)
  const now = new Date()
  const wh = subWarehouse(sub.id, idx).totals
  if (!wh.needed) return null
  // Retardé : du matériel est encore sur site alors que la période de planification est terminée
  const stillOut = wh.surSite > 0 && pe < now && sub.status !== 'annule'
  if (stillOut || (sub.status === 'sur_site' && pe < now)) return 'retarde'
  if (sub.status === 'sur_site') return pe < d1 ? 'retour_attendu' : 'sur_site'
  if (sub.status === 'pret' && pe >= d0) return 'pret'
  if (sub.status === 'confirme' && ps < d1 && pe >= d0) return 'a_preparer'
  return null
}
