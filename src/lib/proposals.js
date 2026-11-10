// Propositions A, B, C… (sans limite) : variantes complètes d'un sous-projet (matériel, équipe, coûts, remises).
// Tant qu'aucune n'est retenue, elles coexistent ; le choix du client écarte les autres (statut Annulé).
import { subShortages, subTotals } from './model'

export const PROPOSAL_STATES = {
  ouverte: { label: 'Proposée', color: '#1f87e5', icon: 'radio_button_unchecked' },
  retenue: { label: 'Retenue', color: '#19b26b', icon: 'check_circle' },
  ecartee: { label: 'Écartée', color: '#8a929c', icon: 'block' },
}

/** A, B… Z, AA, AB… : libellé suivant, sans limite. */
export function labelAt(n) {
  let s = ''
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}
const rank = (label) => [...String(label || '')].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0)
export const byLabel = (a, b) => rank(a.proposal?.label) - rank(b.proposal?.label)
export function nextLabel(labels) {
  const used = new Set(labels)
  for (let i = 0; ; i++) if (!used.has(labelAt(i))) return labelAt(i)
}

/** Jeux de propositions d'un projet : [{ set, items (sous-projets triés A, B…), retained }]. */
export function proposalSets(projectId, idx) {
  const map = new Map()
  for (const s of idx.subsByProject[projectId] || []) {
    if (!s.proposal?.set) continue
    if (!map.has(s.proposal.set)) map.set(s.proposal.set, [])
    map.get(s.proposal.set).push(s)
  }
  return [...map.entries()].map(([set, items]) => {
    items.sort(byLabel)
    return { set, items, retained: items.find((x) => x.proposal.state === 'retenue') || null }
  })
}

/** Propositions sœurs d'un sous-projet (lui compris). */
export function siblingsOf(sub, idx) {
  if (!sub?.proposal?.set) return sub ? [sub] : []
  return (idx.subsByProject[sub.projectId] || []).filter((s) => s.proposal?.set === sub.proposal.set).sort(byLabel)
}

/** Libellé d'un sous-projet : « A · Formule complète » pour une proposition. */
export const subLabel = (sub) => (sub?.proposal?.label ? `${sub.proposal.label} · ${sub.name}` : sub?.name || '')

/** Synthèse d'une proposition pour le comparatif. */
export function proposalSummary(sub, idx) {
  const t = subTotals(sub.id, idx)
  const lines = (idx.linesBySub[sub.id] || []).filter((l) => l.relation === 'principal')
  return {
    totals: t,
    items: lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0),
    articles: lines.length,
    functions: (idx.fnsBySub[sub.id] || []).length,
    shortages: sub.status === 'annule' ? [] : subShortages(sub.id, idx),
    quotes: (idx.docsByProject[sub.projectId] || []).filter((d) => (d.type === 'devis' || d.type === 'contrat') && (d.subprojectIds || []).includes(sub.id)),
  }
}

/** Matériel comparé : une ligne par article, la quantité de chaque proposition. */
export function equipmentDiff(items, idx) {
  const rows = new Map()
  items.forEach((s, i) => {
    for (const l of idx.linesBySub[s.id] || []) {
      if (l.relation !== 'principal' || !l.equipmentId) continue
      if (!rows.has(l.equipmentId)) rows.set(l.equipmentId, { eq: idx.eq[l.equipmentId], qty: items.map(() => 0) })
      rows.get(l.equipmentId).qty[i] += Number(l.quantity) || 0
    }
  })
  return [...rows.values()]
    .map((r) => ({ ...r, same: r.qty.every((q) => q === r.qty[0]) }))
    .sort((a, b) => Number(a.same) - Number(b.same) || String(a.eq?.name).localeCompare(String(b.eq?.name), 'fr'))
}
