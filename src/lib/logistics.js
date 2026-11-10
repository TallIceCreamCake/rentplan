// Préparation et retour du matériel d'un sous-projet (onglet « Préparation & retour »).
import { DEFAULT_SETTINGS } from './seed'
import { subTimes, subWarehouse } from './model'
import { parse, round2 } from './utils'

export const CHARGE_KINDS = {
  nettoyage: { label: 'Nettoyage', icon: 'cleaning_services' },
  entretien: { label: 'Entretien', icon: 'handyman' },
  maintenance: { label: 'Maintenance / réparation', icon: 'build' },
  remplacement: { label: 'Remplacement (perte)', icon: 'report' },
  retard: { label: 'Retour en retard', icon: 'schedule' },
  autre: { label: 'Autre frais', icon: 'receipt_long' },
}

export const CHARGE_STATUSES = {
  a_facturer: { label: 'À facturer', color: '#f08c00' },
  ajoute: { label: 'Ajouté au projet', color: '#1f87e5' },
  facture: { label: 'Facturé', color: '#19b26b' },
  offert: { label: 'Offert', color: '#8a929c' },
}

export const feeSettings = (settings) => ({ ...DEFAULT_SETTINGS.returnFees, ...(settings?.returnFees || {}) })

export const chargeTotal = (c) => round2((Number(c.quantity) || 0) * (Number(c.price) || 0))

/**
 * Statut réel d'un frais : un frais « facturé » dont la facture a été supprimée, ou « ajouté » dont la ligne
 * de coût a disparu, redevient à facturer.
 */
export function chargeStatus(c, idx, seeFinances = true) {
  // Sans la visibilité des finances, les factures ne sont pas chargées : on se fie au lien enregistré
  if (c.status === 'facture' && (!c.invoiceId || (seeFinances && !idx.d.documents.some((d) => d.id === c.invoiceId)))) return 'a_facturer'
  if (c.status === 'ajoute' && (!c.costId || !idx.d.costs.some((x) => x.id === c.costId))) return 'a_facturer'
  return c.status || 'a_facturer'
}

/**
 * Situation du matériel d'un sous-projet, article par article : préparé, parti, revenu (bon état, à nettoyer,
 * endommagé), perdu, encore dehors, numéros de série et notes.
 */
export function logisticsOf(subId, idx) {
  const wh = subWarehouse(subId, idx)
  const lines = idx.linesBySub[subId] || []
  const rows = wh.rows.map((r) => {
    const eq = idx.eq[r.equipmentId]
    const det = r.booking?.details || {}
    const ret = det.ret || {}
    const own = lines.filter((l) => l.equipmentId === r.equipmentId && !l.isOptional)
    const groups = [...new Set(own.map((l) => idx.group[l.groupId]?.name).filter(Boolean))]
    // Contenu d'un case : contrôlé à la préparation, sans être compté à part
    const contents = own.flatMap((l) => lines.filter((c) => c.parentId === l.id && c.relation === 'contenu')).map((c) => ({ name: idx.eq[c.equipmentId]?.name || c.name, qty: Number(c.quantity) || 0 }))
    const serials = [...new Set(own.flatMap((l) => l.serialIds || []))].map((id) => idx.d.serials.find((s) => s.id === id)).filter(Boolean)
    const prepared = r.needed - r.aPreparer
    const out = r.surSite + r.retourne + r.perdu
    const damaged = Math.min(Number(ret.damaged) || 0, r.retourne)
    const cleaning = Math.min(Number(ret.cleaning) || 0, r.retourne - damaged)
    const checkedSerials = det.prep?.serials || []
    const outSerials = det.out?.serials || []
    const serialStates = ret.serialStates || {}
    // Numéros suivis au retour : partis, sinon préparés, plus ceux déjà pointés
    const trackedIds = [...new Set([...(outSerials.length ? outSerials : checkedSerials), ...Object.keys(serialStates)])]
    return {
      ...r, eq, groups, contents, serials, prepared, out, damaged, cleaning, ok: r.retourne - damaged - cleaning,
      serialized: Boolean(eq?.serialized), lineIds: own.map((l) => l.id),
      prepNote: det.prep?.note || '', checkedSerials, outSerials, serialStates, serialRepairs: ret.serialRepairs || {},
      tracked: trackedIds.map((id) => idx.d.serials.find((x) => x.id === id)).filter(Boolean),
      retNote: ret.note || '', repairId: ret.repairId || null,
    }
  })
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0)
  const totals = { needed: sum('needed'), prepared: sum('prepared'), out: sum('out'), surSite: sum('surSite'), retourne: sum('retourne'), perdu: sum('perdu'), damaged: sum('damaged'), cleaning: sum('cleaning') }
  return { rows, totals }
}

/** Jours de retard du retour (fin de planification dépassée, au-delà de la marge configurée). */
export function lateDays(sub, idx, totals) {
  const end = parse(subTimes(sub.id, idx).planEnd)
  if (!end || !totals?.out) return 0
  const doneAt = sub.logistics?.ret?.doneAt ? new Date(sub.logistics.ret.doneAt) : null
  const back = doneAt || (totals.surSite > 0 ? new Date() : null)
  if (!back) return 0
  const grace = (Number(feeSettings(idx.settings).graceHours) || 0) * 3600000
  const late = back - end - grace
  return late > 0 ? Math.ceil(late / 86400000) : 0
}

/** Frais proposés d'après le retour (nettoyage, réparation, perte, retard), sauf ceux déjà saisis. */
export function chargeSuggestions(sub, idx) {
  const { rows, totals } = logisticsOf(sub.id, idx)
  const fees = feeSettings(idx.settings)
  const existing = idx.chargesBySub[sub.id] || []
  const has = (kind, equipmentId = null) => existing.some((c) => c.kind === kind && (c.equipmentId || null) === equipmentId)
  const out = []
  for (const r of rows) {
    const name = r.eq?.name || 'Article'
    if (r.cleaning && !has('nettoyage', r.equipmentId)) out.push({ kind: 'nettoyage', equipmentId: r.equipmentId, label: `Nettoyage — ${name}`, quantity: r.cleaning, price: Number(fees.nettoyage) || 0, reason: `${r.cleaning} revenu(s) à nettoyer` })
    if (r.damaged && !has('maintenance', r.equipmentId)) out.push({ kind: 'maintenance', equipmentId: r.equipmentId, label: `Réparation — ${name}`, quantity: r.damaged, price: Number(fees.maintenance) || 0, reason: `${r.damaged} revenu(s) endommagé(s)` })
    if (r.perdu && !has('remplacement', r.equipmentId)) out.push({ kind: 'remplacement', equipmentId: r.equipmentId, label: `Remplacement — ${name} (non rendu)`, quantity: r.perdu, price: Number(r.eq?.purchasePrice) || 0, reason: `${r.perdu} perdu(s) · valeur d’achat` })
  }
  const days = lateDays(sub, idx, totals)
  if (days && !has('retard')) {
    // Tarif journalier du matériel sorti, au pourcentage configuré
    const daily = rows.reduce((s, r) => s + (Number(r.eq?.rentalPrice) || 0) * r.out, 0)
    out.push({ kind: 'retard', equipmentId: null, label: `Retour en retard (${days} jour${days > 1 ? 's' : ''})`, quantity: days, price: round2(daily * (Number(fees.retardPct) || 0) / 100), reason: `Retour prévu le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(parse(subTimes(sub.id, idx).planEnd))}` })
  }
  return out
}

/** Étape logistique d'un sous-projet, pour l'en-tête de l'onglet. */
export function logisticsStep(sub, totals) {
  if (!totals.needed) return 'vide'
  if (sub.logistics?.ret?.doneAt || sub.status === 'retourne') return 'cloture'
  if (totals.out > 0) return 'retour'
  if (totals.prepared >= totals.needed || sub.logistics?.prep?.doneAt) return 'depart'
  return 'preparation'
}
