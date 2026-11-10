import { addDays, daysSpan, fmtPeriod, hoursSpan, personName, round2, toDateInput, uid } from './utils'
import { assignmentSlots, DOC_TYPES, FIN_CATEGORIES, functionPrice, functionTimes, getIndex, groupTimes, lineFactor, lineTotal, lineUnitPrice, PO_STATUSES, subTotals, subWarehouse } from './model'

export const DOC_SERIES = {
  devis: ['quotePrefix', 'nextQuoteNumber'],
  contrat: ['contractPrefix', 'nextContractNumber'],
  facture: ['invoicePrefix', 'nextInvoiceNumber'],
  avoir: ['creditPrefix', 'nextCreditNumber'],
}

export const docNumber = (settings, type, date = new Date()) => {
  const [prefixKey, counterKey] = DOC_SERIES[type]
  return `${settings[prefixKey] || ''}${date.getFullYear()}-${String(settings[counterKey] || 1).padStart(4, '0')}`
}

/** Prochain numéro : série pour les documents financiers, « BP-114-2 » (préfixe, projet, rang) pour les autres. */
export function nextDocNumber(state, type, projectId, date = new Date()) {
  if (DOC_SERIES[type]) return docNumber(state.settings, type, date)
  const project = state.projects.find((p) => p.id === projectId)
  const n = state.documents.filter((d) => d.projectId === projectId && d.type === type).length + 1
  return `${DOC_TYPES[type]?.prefix || 'DOC'}-${project?.number || 'X'}-${n}`
}

/** Documents non financiers : aucun prix dans le contenu figé (lisible sans la visibilité des finances). */
function withoutPrices(content) {
  const zero = (o, keys) => ({ ...o, ...Object.fromEntries(keys.map((k) => [k, 0])) })
  return {
    ...content,
    subprojects: content.subprojects.map((sp) => ({
      ...sp,
      groups: sp.groups.map((g) => ({ ...g, lines: g.lines.map((l) => zero(l, ['unitPrice', 'total', 'discount'])) })),
      functionGroups: sp.functionGroups.map((g) => ({ ...g, functions: g.functions.map((f) => zero(f, ['unitPrice', 'total'])) })),
      costs: sp.costs.map((c) => zero(c, ['unitPrice', 'total', 'discount'])),
      totals: { categories: {}, insurance: 0, subtotal: 0, discountTotal: 0, totalExVat: 0, vat: 0, total: 0 },
    })),
  }
}

/** Instantané d'un devis / contrat / facture à partir d'un projet (un ou plusieurs sous-projets). */
export function buildDocument(projectId, type, state, { subprojectIds, ...overrides } = {}) {
  const idx = getIndex(state)
  const project = idx.project[projectId]
  const allSubs = (idx.subsByProject[projectId] || []).filter((s) => s.status !== 'annule')
  const subs = subprojectIds?.length ? allSubs.filter((s) => subprojectIds.includes(s.id)) : allSubs
  const multi = allSubs.length > 1
  const sections = []

  for (const sub of subs) {
    const prefix = multi ? `${sub.name} — ` : ''
    for (const g of idx.groupsBySub[sub.id] || []) {
      const lines = (idx.linesByGroup[g.id] || []).filter((l) => l.relation !== 'contenu' && !l.isOptional)
      if (!lines.length) continue
      const t = groupTimes(g, idx)
      sections.push({
        title: `${prefix}${g.name}`,
        subtitle: fmtPeriod(t.useStart, t.useEnd),
        kind: 'materiel',
        remark: g.remark || '',
        lines: lines.map((l) => {
          const eq = idx.eq[l.equipmentId]
          const contents = (idx.linesBySub[sub.id] || []).filter((c) => c.parentId === l.id && c.relation === 'contenu')
          return {
            label: l.name || eq?.name || 'Article',
            details: [
              l.relation === 'accessoire' ? 'Accessoire' : eq?.code,
              contents.length ? `Contenu : ${contents.map((c) => `${c.quantity} × ${idx.eq[c.equipmentId]?.name}`).join(', ')}` : null,
              l.remark,
            ].filter(Boolean).join(' · '),
            qty: Number(l.quantity) || 0,
            unit: lineUnitPrice(l, eq),
            factor: lineFactor(l, idx),
            discount: Number(l.discount) || 0,
            total: lineTotal(l, idx),
          }
        }),
      })
    }
    const fns = idx.fnsBySub[sub.id] || []
    for (const kind of ['equipe', 'transport']) {
      const list = fns.filter((f) => f.kind === kind)
      if (!list.length) continue
      sections.push({
        title: `${prefix}${kind === 'equipe' ? 'Personnel' : 'Transport'}`,
        kind,
        lines: list.map((f) => {
          const t = functionTimes(f, idx)
          const who = (idx.asgByFn[f.id] || [])
            .map((a) => (a.crewId ? personName(idx.crew[a.crewId]) : idx.vehicle[a.vehicleId]?.name))
            .filter(Boolean)
          const q = f.quantity || 1
          const qty =
            f.priceType === 'heure'
              ? round2(Math.max(0, hoursSpan(t.useStart, t.useEnd) - (f.breakMinutes || 0) / 60) * q)
              : f.priceType === 'jour'
                ? daysSpan(t.useStart, t.useEnd) * q
                : f.priceType === 'km'
                  ? (Number(f.distanceKm) || 0) * q
                  : q
          return {
            label: f.name,
            details: [fmtPeriod(t.useStart, t.useEnd), who.length ? who.join(', ') : null].filter(Boolean).join(' · '),
            qty,
            unitLabel: { heure: 'h', jour: 'j', km: 'km', forfait: '' }[f.priceType] || '',
            unit: Number(f.price) || 0,
            factor: 1,
            discount: 0,
            total: functionPrice(f, idx),
          }
        }),
      })
    }
    const costs = idx.costsBySub[sub.id] || []
    if (costs.length) {
      sections.push({
        title: `${prefix}Coûts supplémentaires`,
        kind: 'autres',
        lines: costs.map((c) => ({
          label: c.name,
          details: c.remark || '',
          qty: Number(c.quantity) || 0,
          unit: Number(c.price) || 0,
          factor: 1,
          discount: Number(c.discount) || 0,
          total: round2((Number(c.quantity) || 0) * (Number(c.price) || 0) * (1 - (Number(c.discount) || 0) / 100)),
        })),
      })
    }
  }

  // Totaux : somme des sous-projets ; des propositions sont des alternatives, une seule compte (A, puis celle choisie)
  const totalsOf = (list) => {
    const out = { categories: {}, insurance: 0, discountTotal: 0, totalExVat: 0, vat: 0, total: 0, vatRate: Number(state.settings.vatRate) || 0 }
    for (const sub of list) {
      const t = subTotals(sub.id, idx)
      for (const [k, r] of Object.entries(t.rows)) {
        const c = (out.categories[k] ||= { revenue: 0, discount: 0, total: 0 })
        c.revenue = round2(c.revenue + r.revenue)
        c.total = round2(c.total + r.total)
        c.discount = round2(c.revenue - c.total)
      }
      out.insurance = round2(out.insurance + t.insurance)
      out.discountTotal = round2(out.discountTotal + t.discountTotal)
      out.totalExVat = round2(out.totalExVat + t.totalExVat)
      out.vat = round2(out.vat + t.vat)
      out.total = round2(out.total + t.total)
    }
    return out
  }
  const regular = subs.filter((s) => !s.proposal?.set)
  const sets = new Map()
  for (const s of [...subs].filter((x) => x.proposal?.set).sort((a, b) => String(a.proposal.label).localeCompare(String(b.proposal.label), 'fr', { numeric: true }))) {
    if (!sets.has(s.proposal.set)) sets.set(s.proposal.set, [])
    sets.get(s.proposal.set).push(s)
  }
  const totals = totalsOf([...regular, ...[...sets.values()].map((list) => list[0])])
  // Plusieurs propositions d'un même jeu dans le document : le client en choisira une (à la signature)
  const offered = [...sets.values()].find((list) => list.length > 1)
  const proposals = offered
    ? offered.map((s) => ({ subprojectId: s.id, label: s.proposal.label, name: s.name, totalExVat: subTotals(s.id, idx).totalExVat, total: subTotals(s.id, idx).total, docTotals: totalsOf([...regular, s]) }))
    : []
  if (totals.insurance) sections.push({ title: 'Assurance', kind: 'assurance', lines: [{ label: 'Assurance du matériel loué', details: '', qty: 1, unit: totals.insurance, factor: 1, discount: 0, total: totals.insurance }] })

  const settings = state.settings
  const isQuote = type === 'devis' || type === 'contrat'
  const financial = Boolean(DOC_TYPES[type]?.finance)
  const today = new Date()
  const firstUse = subs.map((s) => idx.periodsByProject[projectId]?.find((p) => p.isUsage)).find(Boolean)
  const content = { ...buildContent(projectId, subs.map((s) => s.id), idx, state), ...(proposals.length && financial ? { proposals } : {}) }
  return {
    id: uid('doc_'),
    type,
    number: nextDocNumber(state, type, projectId, today),
    version: 1,
    projectId,
    clientId: project?.clientId || null,
    subprojectIds: subs.map((s) => s.id),
    date: toDateInput(today),
    dueDate: financial ? toDateInput(addDays(today, isQuote ? settings.quoteValidityDays || 14 : settings.paymentTermDays || 30)) : null,
    status: 'brouillon',
    days: firstUse ? daysSpan(firstUse.startsAt, firstUse.endsAt) : null,
    sections: financial ? sections : [],
    totals: financial ? totals : { categories: {}, insurance: 0, discountTotal: 0, totalExVat: 0, vat: 0, total: 0, vatRate: totals.vatRate },
    content: financial ? content : withoutPrices(content),
    notes: financial ? (isQuote ? settings.quoteTerms : settings.invoiceTerms) : '',
    partialPct: null,
    extraLines: [],
    payments: [],
    fromQuote: null,
    signedAt: null,
    templateId: null,
    letterheadId: null,
    body: null,
    subject: null,
    fileName: null,
    showBackground: null,
    signature: null,
    createdAt: today.toISOString(),
    ...overrides,
  }
}

const unitLabels = { heure: 'h', jour: 'j', km: 'km', forfait: '' }

/** Quantité facturée d'une fonction (heures, jours, km ou forfait). */
function billedQty(f, t) {
  const q = f.quantity || 1
  if (f.priceType === 'heure') return round2(Math.max(0, hoursSpan(t.useStart, t.useEnd) - (f.breakMinutes || 0) / 60) * q)
  if (f.priceType === 'jour') return daysSpan(t.useStart, t.useEnd) * q
  if (f.priceType === 'km') return (Number(f.distanceKm) || 0) * q
  return q
}

/**
 * Contenu figé d'un document, lu par les modules des modèles : matériel (avec contenu des kits et
 * accessoires), fonctions et affectations, coûts, périodes, totaux par sous-projet, tâches et notes.
 */
export function buildContent(projectId, subprojectIds, idx, state = idx.d) {
  const subs = subprojectIds.map((id) => idx.sub[id]).filter(Boolean)
  const periods = (idx.periodsByProject[projectId] || []).map((p) => ({ id: p.id, subprojectId: p.subprojectId, name: p.name, start: p.startsAt, end: p.endsAt, external: Boolean(p.showExternal), usage: Boolean(p.isUsage), planning: Boolean(p.isPlanning) }))
  return {
    v: 1,
    periods,
    subprojects: subs.map((sub) => {
      const all = idx.linesBySub[sub.id] || []
      const wh = Object.fromEntries(subWarehouse(sub.id, idx).rows.map((r) => [r.equipmentId, r]))
      const lineOf = (l, depth, g) => {
        const eq = idx.eq[l.equipmentId]
        const w = wh[l.equipmentId]
        const qty = Number(l.quantity) || 0
        const cap = (n) => Math.min(qty, Number(n) || 0)
        return {
          id: l.id, equipmentId: l.equipmentId, depth, relation: l.relation || 'principal', qty,
          name: l.name || eq?.name || 'Article', code: eq?.code || '', category: idx.cat[eq?.categoryId]?.name || '', group: g.name,
          unitPrice: lineUnitPrice(l, eq), factor: lineFactor(l, idx), discount: Number(l.discount) || 0, total: l.isOptional ? round2(qty * lineUnitPrice(l, eq) * lineFactor(l, idx) * (1 - (Number(l.discount) || 0) / 100)) : lineTotal(l, idx),
          optional: Boolean(l.isOptional), kind: eq?.kind === 'vente' ? 'vente' : 'location', type: eq?.type || 'article',
          weight: Number(eq?.weight) || 0, power: Number(eq?.power) || 0, remark: l.remark || '', image: eq?.imageUrl || null, location: eq?.location || '',
          serials: (l.serialIds || []).map((sid) => idx.d.serials.find((x) => x.id === sid)?.serial).filter(Boolean),
          ready: cap(w?.pret), onSite: cap(w?.surSite), toPrepare: cap(w?.aPreparer),
        }
      }
      const groups = (idx.groupsBySub[sub.id] || []).map((g) => {
        const t = groupTimes(g, idx)
        const lines = []
        const walk = (l, depth) => {
          lines.push(lineOf(l, depth, g))
          for (const c of all.filter((x) => x.parentId === l.id)) walk(c, depth + 1)
        }
        for (const l of (idx.linesByGroup[g.id] || []).filter((x) => !x.parentId)) walk(l, 0)
        return { id: g.id, name: g.name, start: t.useStart, end: t.useEnd, remark: g.remark || '', lines }
      })
      const fns = idx.fnsBySub[sub.id] || []
      const fnOf = (f) => {
        const t = functionTimes(f, idx)
        const grp = idx.fgroup[f.groupId]
        return {
          id: f.id, kind: f.kind, name: f.name, group: grp?.name || (f.kind === 'transport' ? 'Transport' : 'Équipe'), qty: f.quantity || 1,
          start: t.useStart, end: t.useEnd, unitPrice: Number(f.price) || 0, unitLabel: unitLabels[f.priceType] || '', billedQty: billedQty(f, t), total: functionPrice(f, idx), remark: f.remark || '',
          // Une ligne par créneau : une personne planifiée sur plusieurs jours apparaît à chaque créneau
          assigned: (idx.asgByFn[f.id] || []).flatMap((a) => {
            const c = idx.crew[a.crewId]
            const v = idx.vehicle[a.vehicleId]
            const base = { name: c ? personName(c) : v?.name || '', phone: c?.phone || '', email: c?.email || '', vehicle: v?.name || '', plate: v?.plate || '', function: f.name, isVehicle: Boolean(v) }
            const slots = assignmentSlots(a, idx)
            return slots.length ? slots.map((sl) => ({ ...base, start: sl.start, end: sl.end, note: sl.note || '' })) : [{ ...base, start: t.planStart, end: t.planEnd }]
          }),
        }
      }
      const fgroups = (idx.fgroupsBySub[sub.id] || []).map((g) => ({ id: g.id, name: g.name, functions: fns.filter((f) => f.groupId === g.id).map(fnOf) }))
      for (const kind of ['equipe', 'transport']) {
        const loose = fns.filter((f) => f.kind === kind && !idx.fgroup[f.groupId])
        if (loose.length) fgroups.push({ id: `${sub.id}-${kind}`, name: kind === 'transport' ? 'Transport' : 'Équipe', functions: loose.map(fnOf) })
      }
      const t = subTotals(sub.id, idx)
      return {
        id: sub.id, name: sub.name, status: sub.status, conditions: sub.additionalConditions || '', deposit: Number(sub.deposit) || 0, proposalLabel: sub.proposal?.label || null,
        groups,
        functionGroups: fgroups.filter((g) => g.functions.length),
        costs: (idx.costsBySub[sub.id] || []).map((c) => ({ name: c.name, qty: Number(c.quantity) || 0, unitPrice: Number(c.price) || 0, discount: Number(c.discount) || 0, total: round2((Number(c.quantity) || 0) * (Number(c.price) || 0) * (1 - (Number(c.discount) || 0) / 100)), remark: c.remark || '' })),
        totals: {
          categories: Object.fromEntries(FIN_CATEGORIES.map((c) => [c.id, { revenue: round2(t.rows[c.id].revenue), discountPct: t.rows[c.id].discount, discount: round2(t.rows[c.id].revenue - t.rows[c.id].total), total: t.rows[c.id].total }])),
          insurance: t.insurance, insurancePct: Number(sub.insurancePct) || 0, subtotal: t.subtotal, discountTotal: t.discountTotal, discountPct: Number(sub.discountTotal) || 0, totalExVat: t.totalExVat, vat: t.vat, total: t.total,
        },
      }
    }),
    tasks: (idx.tasksByProject[projectId] || []).map((t) => ({ title: t.title, status: t.status, deadline: t.deadline, details: t.details || '', assignees: (t.assignees || []).map((a) => personName(idx.crew[a])).filter((n) => n && n !== '—') })),
    notes: (state.notes || []).filter((n) => n.projectId === projectId).map((n) => ({ text: n.text, scope: n.scope, author: n.author, createdAt: n.createdAt, subprojectId: n.subprojectId })),
  }
}

/** Montant final d'un document (facture partielle et lignes supplémentaires comprises). */
export function documentAmounts(doc) {
  const base = doc.totals?.totalExVat || 0
  const pct = doc.partialPct != null ? Number(doc.partialPct) / 100 : 1
  const extra = (doc.extraLines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const sign = doc.type === 'avoir' ? -1 : 1
  const exVat = round2(sign * (base * pct + extra))
  const vat = round2(exVat * ((doc.totals?.vatRate || 0) / 100))
  return { exVat, vat, total: round2(exVat + vat) }
}

/**
 * Document « Bon de commande » construit à la volée depuis un bon de commande (il n'est pas enregistré parmi les
 * documents) : le fournisseur tient la place du client, les lignes celle des coûts, la sous-location donne la période.
 */
export function purchaseOrderDoc(po, idx) {
  const sr = po.subrentId ? idx.d.subrents.find((x) => x.id === po.subrentId) : null
  const project = idx.project[po.projectId]
  const location = idx.location?.[project?.stockLocationId] || idx.d.stockLocations?.find((l) => l.isDefault)
  const vatRate = Number(idx.settings.vatRate) || 0
  const lines = (po.lines || []).map((l) => {
    const qty = Number(l.quantity) || 0
    const unitPrice = Number(l.price) || 0
    return { name: l.label || '', qty, unitPrice, discount: 0, total: round2(qty * unitPrice), remark: l.remark || '' }
  })
  const exVat = round2(lines.reduce((t, l) => t + l.total, 0))
  const vat = round2((exVat * vatRate) / 100)
  const total = round2(exVat + vat)
  const cats = Object.fromEntries(FIN_CATEGORIES.map((c) => [c.id, { revenue: c.id === 'autres' ? exVat : 0, discount: 0, total: c.id === 'autres' ? exVat : 0 }]))
  return {
    id: po.id,
    type: 'commande',
    number: po.number,
    version: 1,
    projectId: po.projectId || null,
    clientId: po.supplierId || null,
    subprojectIds: [],
    date: po.date,
    dueDate: null,
    status: po.status,
    sections: [{ title: 'Commande', kind: 'autres', lines: lines.map((l) => ({ label: l.name, details: l.remark, qty: l.qty, unit: l.unitPrice, factor: 1, discount: 0, total: l.total })) }],
    totals: { categories: cats, insurance: 0, discountTotal: 0, totalExVat: exVat, vat, total, vatRate },
    content: {
      v: 1,
      periods: sr?.startsAt ? [{ id: 'sous-location', subprojectId: null, name: 'Période de sous-location', start: sr.startsAt, end: sr.endsAt, external: true, usage: true, planning: true }] : [],
      subprojects: [{
        id: 'commande', name: 'Commande', status: po.status, conditions: '', deposit: 0, groups: [], functionGroups: [], costs: lines,
        totals: { categories: Object.fromEntries(Object.entries(cats).map(([k, c]) => [k, { ...c, discountPct: 0 }])), insurance: 0, insurancePct: 0, subtotal: exVat, discountTotal: 0, discountPct: 0, totalExVat: exVat, vat, total },
      }],
      tasks: [],
      notes: [],
    },
    notes: po.notes || '',
    partialPct: null,
    extraLines: [],
    payments: [],
    templateId: po.templateId || null,
    letterheadId: po.letterheadId || null,
    body: po.body || null,
    subject: null,
    fileName: null,
    showBackground: po.showBackground ?? null,
    signature: null,
    order: {
      number: po.number,
      statusLabel: PO_STATUSES.find((x) => x.id === po.status)?.label || '',
      subrent: sr?.number || '',
      start: sr?.startsAt || null,
      end: sr?.endsAt || null,
      delivery: location ? [location.name, location.address].filter(Boolean).join(' — ') : '',
      totalExVat: exVat,
      supplierId: po.supplierId || null,
    },
  }
}


/**
 * Document « Étiquette » d'un numéro de série (ou d'un équipement sans numéro), construit à la volée : il n'est pas
 * enregistré parmi les documents.
 */
export function labelDoc({ equipmentId, serialId = null, copy = 0 }, idx) {
  const serial = serialId ? idx.d.serials.find((x) => x.id === serialId) : null
  const eq = idx.eq[equipmentId || serial?.equipmentId]
  return {
    id: `etiquette-${serial?.id || eq?.id || 'vide'}-${copy}`,
    type: 'etiquette',
    number: serial?.serial || eq?.code || eq?.name || '',
    version: 1,
    projectId: null,
    clientId: null,
    subprojectIds: [],
    date: new Date().toISOString().slice(0, 10),
    dueDate: null,
    status: 'brouillon',
    sections: [],
    totals: { categories: {}, insurance: 0, discountTotal: 0, totalExVat: 0, vat: 0, total: 0, vatRate: 0 },
    content: { v: 1, periods: [], subprojects: [], tasks: [], notes: [] },
    notes: '',
    partialPct: null,
    extraLines: [],
    payments: [],
    templateId: null,
    letterheadId: null,
    body: null,
    subject: null,
    fileName: null,
    showBackground: false,
    signature: null,
    label: { equipmentId: eq?.id || null, serialId: serial?.id || null },
  }
}
