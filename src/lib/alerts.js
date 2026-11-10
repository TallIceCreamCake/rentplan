import { addDays, fmtDate, fmtRange, parse, personName, startOfDay } from './utils'
import { crewConflicts, docStatusOf, functionFill, functionTimes, projectShortages, projectTimes, subtractsAvailability } from './model'

/** Alertes à traiter (cloche de la barre du haut et tableau de bord). */
export function computeAlerts(idx) {
  const d = idx.d
  const today = startOfDay(new Date())
  const out = []
  const upcoming = d.projects.filter((p) => {
    const t = projectTimes(p.id, idx)
    return t.planEnd && parse(t.planEnd) >= today
  })

  for (const p of upcoming) {
    const list = projectShortages(p.id, idx)
    if (list.length)
      out.push({
        id: `short-${p.id}`,
        kind: 'shortage',
        title: `Pénurie : ${p.name}`,
        meta: list.map((s) => `${idx.eq[s.equipmentId]?.name} (−${s.shortage})`).join(', '),
        to: `/projets/${p.id}?tab=equipement`,
      })
  }
  for (const c of crewConflicts(idx)) {
    const fa = idx.fn[c.a.functionId]
    const fb = idx.fn[c.b.functionId]
    const ta = functionTimes(fa, idx)
    if (!ta.planEnd || parse(ta.planEnd) < today) continue
    out.push({
      id: `conf-${c.a.id}-${c.b.id}`,
      kind: 'conflict',
      title: `Double réservation : ${personName(idx.crew[c.crewId])}`,
      meta: `${idx.project[fa?.projectId]?.name} / ${idx.project[fb?.projectId]?.name}`,
      to: `/projets/${fa?.projectId}?tab=personnel`,
    })
  }
  for (const f of d.functions) {
    const sub = idx.sub[f.subprojectId]
    if (!sub || !subtractsAvailability(sub.status) || sub.status === 'demande') continue
    const t = functionTimes(f, idx)
    if (!t.planEnd || parse(t.planEnd) < today) continue
    const fill = functionFill(f, idx)
    if (fill.full) continue
    out.push({
      id: `unf-${f.id}`,
      kind: 'unfilled',
      title: `Fonction à pourvoir : ${f.name} (${fill.planned}/${fill.needed})`,
      meta: `${idx.project[f.projectId]?.name} · ${fmtRange(t.planStart, t.planEnd)}`,
      to: `/projets/${f.projectId}?tab=${f.kind === 'transport' ? 'transports' : 'personnel'}`,
    })
  }
  for (const doc of d.documents) {
    if (doc.type === 'facture' && docStatusOf(doc).id === 'retard')
      out.push({ id: `late-${doc.id}`, kind: 'late', title: `Facture en retard : ${doc.number}`, meta: `Échéance le ${fmtDate(doc.dueDate)}`, to: `/documents/${doc.id}` })
  }
  for (const ins of d.inspections) {
    if (ins.result === 'ok' || !ins.nextDate || parse(ins.nextDate) > addDays(today, 30)) continue
    out.push({ id: `ins-${ins.id}`, kind: 'inspection', title: `Inspection à prévoir : ${ins.name}`, meta: `${idx.eq[ins.equipmentId]?.name} · avant le ${fmtDate(ins.nextDate)}`, to: '/maintenance?tab=inspections' })
  }
  for (const r of d.requests.filter((x) => x.status === 'nouvelle'))
    out.push({ id: `rq-${r.id}`, kind: 'request', title: `Nouvelle demande : ${r.eventName}`, meta: r.company || r.contactName, to: '/demandes' })
  for (const a of d.crewAvailability.filter((x) => x.kind === 'conge' && x.status === 'demande'))
    out.push({ id: `leave-${a.id}`, kind: 'request', title: `Demande de congé : ${personName(idx.crew[a.crewId])}`, meta: fmtRange(a.startsAt, a.endsAt), to: `/personnel/${a.crewId}?tab=disponibilite` })
  return out
}
