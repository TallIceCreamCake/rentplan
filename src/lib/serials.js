// Numéros de série : où se trouve chaque unité (disponible, réservée, prête, sur site, en réparation, perdue),
// conflits d'attribution entre projets qui se chevauchent et attribution automatique.
import { groupTimes } from './model'
import { overlaps, parse } from './utils'

/** Statut saisi à la main sur la fiche du numéro. */
export const SERIAL_STATUSES = [
  { id: 'ok', label: 'En service', color: '#19b26b' },
  { id: 'maintenance', label: 'En maintenance', color: '#f08c00' },
  { id: 'hs', label: 'Hors service', color: '#e2284f' },
  { id: 'perdu', label: 'Perdu', color: '#5f6b7a' },
]

/** État réel, déduit des projets, de l'entrepôt et des réparations. */
export const SERIAL_STATES = {
  dispo: { label: 'Disponible', color: '#19b26b', icon: 'check_circle' },
  reserve: { label: 'Réservé', color: '#1f87e5', icon: 'event' },
  pret: { label: 'Prêt', color: '#0b6fb8', icon: 'inventory' },
  sur_site: { label: 'Sur site', color: '#0e9f9a', icon: 'place' },
  retard: { label: 'Non rendu', color: '#e2284f', icon: 'schedule' },
  reparation: { label: 'En réparation', color: '#f08c00', icon: 'build' },
  maintenance: { label: 'En maintenance', color: '#f08c00', icon: 'build' },
  hs: { label: 'Hors service', color: '#e2284f', icon: 'block' },
  perdu: { label: 'Perdu', color: '#5f6b7a', icon: 'report' },
}
/** États qui empêchent d'attribuer ou de préparer le numéro. */
export const UNUSABLE = ['perdu', 'hs', 'reparation', 'maintenance']

const active = (sub) => sub && sub.status !== 'annule' && sub.status !== 'retourne'
const cache = new WeakMap()

/** Attributions, réparations et mouvements d'entrepôt par numéro (mémorisé pour chaque index du store). */
function serialIndex(idx) {
  const hit = cache.get(idx)
  if (hit) return hit
  const uses = new Map()
  for (const l of idx.d.plannedEquipment) {
    if (!l.serialIds?.length) continue
    const sub = idx.sub[l.subprojectId]
    if (!active(sub)) continue
    const t = groupTimes(idx.group[l.groupId], idx)
    const u = { line: l, sub, project: idx.project[l.projectId], start: parse(t.planStart), end: parse(t.planEnd) }
    for (const id of l.serialIds) {
      if (!uses.has(id)) uses.set(id, [])
      uses.get(id).push(u)
    }
  }
  const repairs = new Map()
  for (const r of idx.d.repairs) if (r.serialId && r.status === 'en_cours') repairs.set(r.serialId, r)
  // Préparé (prep), parti (out), revenu (ret.serialStates) : seuls les mouvements en cours comptent
  const moves = new Map()
  for (const b of idx.d.bookings) {
    const sub = idx.sub[b.subprojectId]
    if (!active(sub)) continue
    const det = b.details || {}
    const back = det.ret?.serialStates || {}
    const out = new Set(det.out?.serials || [])
    const end = (uses.get([...out][0]) || []).find((u) => u.sub.id === sub.id)?.end
    for (const id of new Set([...(det.prep?.serials || []), ...out])) {
      if (back[id]) continue
      moves.set(id, { state: out.has(id) ? 'sur_site' : 'pret', sub, project: idx.project[sub.projectId], end: end || null })
    }
  }
  const x = { uses, repairs, moves }
  cache.set(idx, x)
  return x
}

const withMeta = (id, extra = {}) => ({ id, ...SERIAL_STATES[id], ...extra })

/** État réel d'un numéro de série. */
export function serialState(serial, idx, now = new Date()) {
  if (serial.status === 'perdu') return withMeta('perdu')
  if (serial.status === 'hs') return withMeta('hs')
  const x = serialIndex(idx)
  const repair = x.repairs.get(serial.id)
  if (repair) return withMeta('reparation', { repair })
  if (serial.status === 'maintenance') return withMeta('maintenance')
  const mv = x.moves.get(serial.id)
  const uses = x.uses.get(serial.id) || []
  if (mv) {
    const end = mv.end || uses.find((u) => u.sub.id === mv.sub.id)?.end
    if (mv.state === 'sur_site') return withMeta(end && end < now ? 'retard' : 'sur_site', { sub: mv.sub, project: mv.project, until: end })
    return withMeta('pret', { sub: mv.sub, project: mv.project, until: end })
  }
  const next = uses.filter((u) => u.end && u.end >= now).sort((a, b) => a.start - b.start)[0]
  if (next) return withMeta('reserve', { sub: next.sub, project: next.project, from: next.start, until: next.end })
  return withMeta('dispo')
}

/** Projets dont la période chevauche celle de la ligne et qui utilisent aussi ce numéro. */
export function serialConflicts(serialId, line, idx) {
  const t = groupTimes(idx.group[line.groupId], idx)
  const s = parse(t.planStart)
  const e = parse(t.planEnd)
  if (!s || !e) return []
  const x = serialIndex(idx)
  const list = (x.uses.get(serialId) || []).filter((u) => u.line.id !== line.id && u.sub.id !== line.subprojectId && u.start && overlaps(u.start, u.end, s, e))
  // Encore sur site ou prêt pour un autre projet
  const mv = x.moves.get(serialId)
  if (mv && mv.sub.id !== line.subprojectId && !list.some((u) => u.sub.id === mv.sub.id)) list.push({ sub: mv.sub, project: mv.project, start: null, end: mv.end, moving: mv.state })
  return list
}

/** Raison pour laquelle un numéro ne peut pas servir sur la ligne (sinon null). */
export function serialIssue(serial, line, idx) {
  const st = serialState(serial, idx)
  if (UNUSABLE.includes(st.id)) return st.label
  const c = serialConflicts(serial.id, line, idx)[0]
  if (c) return `${c.moving === 'sur_site' ? 'Sur site pour' : c.moving === 'pret' ? 'Préparé pour' : 'Aussi attribué à'} ${c.project?.number || ''} ${c.project?.name || ''}`.trim()
  return null
}

/** Numéros libres pour la ligne : ceux du dépôt du projet d'abord, puis dans l'ordre des numéros. */
export function availableSerials(line, idx) {
  const home = idx.project[line.projectId]?.stockLocationId
  const rank = (s) => (s.stockLocationId === home ? 0 : 1)
  return (idx.serialsByEq[line.equipmentId] || [])
    .filter((s) => !(line.serialIds || []).includes(s.id) && !serialIssue(s, line, idx))
    .sort((a, b) => rank(a) - rank(b) || String(a.serial).localeCompare(String(b.serial), 'fr', { numeric: true }))
}

/** Historique d'un numéro : projets où il a été attribué ou préparé. */
export function serialHistory(serialId, idx) {
  const seen = new Map()
  for (const l of idx.d.plannedEquipment) {
    if (!l.serialIds?.includes(serialId)) continue
    const t = groupTimes(idx.group[l.groupId], idx)
    seen.set(l.subprojectId, { sub: idx.sub[l.subprojectId], project: idx.project[l.projectId], start: t.planStart, end: t.planEnd })
  }
  for (const b of idx.d.bookings) {
    const det = b.details || {}
    if (!(det.prep?.serials || []).includes(serialId) && !(det.out?.serials || []).includes(serialId)) continue
    const prev = seen.get(b.subprojectId) || { sub: idx.sub[b.subprojectId], project: idx.project[b.projectId] }
    seen.set(b.subprojectId, { ...prev, returned: det.ret?.serialStates?.[serialId] || null })
  }
  return [...seen.values()].filter((x) => x.project).sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')))
}
