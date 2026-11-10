import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { COLLECTIONS, DB_ENABLED, flush, isDenied, loadAll, removeStoredFiles, startSync, storagePathOf, unlinkCrewAccounts, useSyncStatus, wipeAll } from './lib/db'
import { currentAccess, currentUserName, useAuth } from './lib/auth'
import { COLLECTION_MODULES, MODULE_BY_ID } from './lib/permissions'
import { toast } from './lib/toast'
import { createSeed, DEFAULT_SETTINGS } from './lib/seed'
import { buildContent, buildDocument, DOC_SERIES, documentAmounts } from './lib/documents'
import { defaultLetterheadId, defaultTemplateId, letterheadsFor } from './lib/templates'
import { DEFAULT_LETTERHEADS } from './lib/templates/defaults'
import { defaultPeriods, FIN_CATEGORIES, getIndex, subWarehouse } from './lib/model'
import { CHARGE_KINDS, chargeTotal } from './lib/logistics'
import { availableSerials } from './lib/serials'
import { nextLabel } from './lib/proposals'
import { addDays, round2, startOfDay, toDateInput, toLocalInput, uid } from './lib/utils'

const emptyData = () => ({ settings: { ...DEFAULT_SETTINGS }, ...Object.fromEntries(COLLECTIONS.map((c) => [c, []])) })
const noStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

/** Lignes, totaux et contenu d'une facture de frais de retour (un seul poste : Autres). */
function feeInvoiceParts(state, subId, fees) {
  const sub = state.subprojects.find((x) => x.id === subId)
  const vatRate = Number(state.settings.vatRate) || 0
  const detail = (c) => [CHARGE_KINDS[c.kind]?.label, c.note].filter(Boolean).join(' · ')
  const exVat = round2(fees.reduce((t, c) => t + chargeTotal(c), 0))
  const vat = round2((exVat * vatRate) / 100)
  const total = round2(exVat + vat)
  const cat = (id, extra = {}) => ({ revenue: id === 'autres' ? exVat : 0, discount: 0, total: id === 'autres' ? exVat : 0, ...extra })
  const content = buildContent(sub.projectId, [subId], getIndex(state), state)
  content.subprojects = content.subprojects.map((sp) => ({
    ...sp,
    groups: [],
    functionGroups: [],
    costs: fees.map((c) => ({ name: c.label, qty: Number(c.quantity) || 0, unitPrice: Number(c.price) || 0, discount: 0, total: chargeTotal(c), remark: detail(c) })),
    totals: { categories: Object.fromEntries(FIN_CATEGORIES.map((c) => [c.id, cat(c.id, { discountPct: 0 })])), insurance: 0, insurancePct: 0, subtotal: exVat, discountTotal: 0, discountPct: 0, totalExVat: exVat, vat, total },
  }))
  return {
    body: '<p>Facture complémentaire : frais constatés au retour du matériel (nettoyage, entretien, réparation, remplacement ou retard).</p>',
    sections: [{ title: 'Frais de retour du matériel', kind: 'autres', lines: fees.map((c) => ({ label: c.label, details: detail(c), qty: Number(c.quantity) || 0, unit: Number(c.price) || 0, factor: 1, discount: 0, total: chargeTotal(c) })) }],
    totals: { categories: Object.fromEntries(FIN_CATEGORIES.map((c) => [c.id, cat(c.id)])), insurance: 0, discountTotal: 0, totalExVat: exVat, vat, total, vatRate },
    content,
  }
}

const replaceIn = (list, id, patch) => list.map((x) => (x.id === id ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x))

export const useStore = create(
  persist(
    (set, get) => ({
      ...(DB_ENABLED ? emptyData() : structuredClone(createSeed())),
      ready: !DB_ENABLED,
      bootError: null,

      // ---------- CRUD générique ----------
      upsert: (collection, item) => {
        const list = get()[collection]
        set({ [collection]: list.some((x) => x.id === item.id) ? replaceIn(list, item.id, item) : [...list, item] })
        return item
      },
      upsertMany: (collection, items) => {
        const map = new Map(get()[collection].map((x) => [x.id, x]))
        for (const it of items) map.set(it.id, { ...(map.get(it.id) || {}), ...it })
        set({ [collection]: [...map.values()] })
      },
      patch: (collection, id, patch) => set({ [collection]: replaceIn(get()[collection], id, patch) }),
      remove: (collection, id) => set({ [collection]: get()[collection].filter((x) => x.id !== id) }),
      removeWhere: (collection, pred) => set({ [collection]: get()[collection].filter((x) => !pred(x)) }),
      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

      /** Consomme le prochain numéro d'une série (projets, devis, factures…). */
      takeNumber: (counterKey) => {
        const s = get().settings
        const n = s[counterKey] || 1
        set({ settings: { ...s, [counterKey]: n + 1 } })
        return n
      },

      // ---------- Projets ----------
      createProject: ({ name, clientId = null, venueId = null, typeId = null, contactPersonId = null, status = 'concept', planStart, planEnd, useStart, useEnd, kind = 'standard', stockLocationId, transferToId = null, color = null, externalRef = null, groupName = 'Matériel' }) => {
        const T = startOfDay(new Date())
        const at = (d, h) => {
          const x = addDays(T, d)
          x.setHours(h, 0, 0, 0)
          return toLocalInput(x)
        }
        const number = String(get().takeNumber('nextProjectNumber'))
        const pid = uid('p_')
        const sid = uid('sp_')
        const pp = { id: uid('per_'), projectId: pid, subprojectId: null, name: 'Période de planification', startsAt: planStart || at(6, 8), endsAt: planEnd || at(8, 12), isPlanning: true, isUsage: false, showInternal: true, showExternal: false, sort: 0 }
        const { defaultStartHour = 9, defaultEndHour = 23 } = get().settings
        const up = { id: uid('per_'), projectId: pid, subprojectId: null, name: 'Période d’utilisation', startsAt: useStart || at(7, defaultStartHour), endsAt: useEnd || at(defaultEndHour > defaultStartHour ? 7 : 8, defaultEndHour), isPlanning: false, isUsage: true, showInternal: true, showExternal: true, sort: 1 }
        const s = get()
        // Les remises par défaut du client s'appliquent au nouveau projet
        const client = s.contacts.find((c) => c.id === clientId)
        const discounts = {}
        if (Number(client?.discountEquipment)) discounts.location = Number(client.discountEquipment)
        if (Number(client?.discountCrew)) discounts.personnel = Number(client.discountCrew)
        set({
          projects: [...s.projects, { id: pid, number, name: name || 'Nouveau projet', kind, typeId, clientId, contactPersonId, venueId, accountManager: currentUserName(), color, externalRef, stockLocationId: stockLocationId || s.stockLocations.find((l) => l.isDefault)?.id || null, transferToId: kind === 'transfert' ? transferToId : null, notes: '', externalNotes: '', tags: [], createdAt: new Date().toISOString() }],
          subprojects: [...s.subprojects, { id: sid, projectId: pid, name: name || 'Nouveau projet', sort: 0, status, discounts, discountTotal: 0, lockedTotal: null, insurancePct: 0, deposit: 0, depositStatus: 'aucune', additionalConditions: '' }],
          periods: [...s.periods, pp, up],
          equipmentGroups: [...s.equipmentGroups, { id: uid('g_'), projectId: pid, subprojectId: sid, name: groupName, sort: 0, planningPeriodId: pp.id, usagePeriodId: up.id, planStart: null, planEnd: null, useStart: null, useEnd: null, remark: '' }],
        })
        return { projectId: pid, subprojectId: sid }
      },

      removeProject: (pid) => {
        const s = get()
        const own = (x) => x.projectId === pid
        set({
          projects: s.projects.filter((p) => p.id !== pid),
          ...Object.fromEntries(['subprojects', 'periods', 'equipmentGroups', 'plannedEquipment', 'bookings', 'functionGroups', 'functions', 'assignments', 'costs', 'notes', 'tasks', 'files'].map((c) => [c, s[c].filter((x) => !own(x))])),
          ...Object.fromEntries(['documents', 'subrents', 'purchaseOrders', 'timeEntries', 'requests'].map((c) => [c, s[c].map((x) => (own(x) ? { ...x, projectId: null } : x))])),
        })
      },

      /** Copie le contenu d'un sous-projet (sans personnel ni véhicules planifiés, comme dans Rentman). */
      _cloneSubContent: (fromSubId, toProjectId, toSubId, periodMap = {}) => {
        const s = get()
        const gMap = {}
        const lMap = {}
        const fgMap = {}
        const groups = s.equipmentGroups.filter((g) => g.subprojectId === fromSubId).map((g) => {
          gMap[g.id] = uid('g_')
          return { ...g, id: gMap[g.id], projectId: toProjectId, subprojectId: toSubId, planningPeriodId: periodMap[g.planningPeriodId] ?? g.planningPeriodId, usagePeriodId: periodMap[g.usagePeriodId] ?? g.usagePeriodId }
        })
        const srcLines = s.plannedEquipment.filter((l) => l.subprojectId === fromSubId)
        srcLines.forEach((l) => (lMap[l.id] = uid('pe_')))
        const lines = srcLines.map((l) => ({ ...l, id: lMap[l.id], parentId: l.parentId ? lMap[l.parentId] || null : null, projectId: toProjectId, subprojectId: toSubId, groupId: gMap[l.groupId], reservedQty: 0, serialIds: [] }))
        const fgroups = s.functionGroups.filter((g) => g.subprojectId === fromSubId).map((g) => {
          fgMap[g.id] = uid('fg_')
          return { ...g, id: fgMap[g.id], projectId: toProjectId, subprojectId: toSubId, planningPeriodId: periodMap[g.planningPeriodId] ?? g.planningPeriodId, usagePeriodId: periodMap[g.usagePeriodId] ?? g.usagePeriodId }
        })
        const fns = s.functions.filter((f) => f.subprojectId === fromSubId).map((f) => ({ ...f, id: uid('fn_'), projectId: toProjectId, subprojectId: toSubId, groupId: fgMap[f.groupId] || null, planningPeriodId: periodMap[f.planningPeriodId] ?? f.planningPeriodId, usagePeriodId: periodMap[f.usagePeriodId] ?? f.usagePeriodId }))
        const costs = s.costs.filter((c) => c.subprojectId === fromSubId).map((c) => ({ ...c, id: uid('cs_'), projectId: toProjectId, subprojectId: toSubId }))
        set({
          equipmentGroups: [...s.equipmentGroups, ...groups],
          plannedEquipment: [...s.plannedEquipment, ...lines],
          functionGroups: [...s.functionGroups, ...fgroups],
          functions: [...s.functions, ...fns],
          costs: [...s.costs, ...costs],
        })
      },

      duplicateProject: (pid) => {
        const s = get()
        const src = s.projects.find((p) => p.id === pid)
        if (!src) return null
        const newId = uid('p_')
        const number = String(get().takeNumber('nextProjectNumber'))
        const periodMap = {}
        const subMap = {}
        const subs = s.subprojects.filter((x) => x.projectId === pid).map((x) => {
          subMap[x.id] = uid('sp_')
          return { ...x, id: subMap[x.id], projectId: newId, status: 'concept', lockedTotal: null, depositStatus: 'aucune' }
        })
        const periods = s.periods.filter((p) => p.projectId === pid).map((p) => {
          periodMap[p.id] = uid('per_')
          return { ...p, id: periodMap[p.id], projectId: newId, subprojectId: p.subprojectId ? subMap[p.subprojectId] : null }
        })
        set({
          projects: [...get().projects, { ...src, id: newId, number, name: `${src.name} (copie)`, createdAt: new Date().toISOString() }],
          subprojects: [...get().subprojects, ...subs],
          periods: [...get().periods, ...periods],
        })
        for (const [oldSub, newSub] of Object.entries(subMap)) get()._cloneSubContent(oldSub, newId, newSub, periodMap)
        return newId
      },

      addSubproject: (projectId, name, fromSubId = null) => {
        const s = get()
        const subs = s.subprojects.filter((x) => x.projectId === projectId)
        const sid = uid('sp_')
        const base = s.subprojects.find((x) => x.id === fromSubId) || subs[0]
        set({ subprojects: [...s.subprojects, { ...(base || {}), id: sid, projectId, name, sort: subs.length, status: base?.status || 'concept', discounts: fromSubId ? base.discounts : {}, lockedTotal: null, depositStatus: 'aucune', deposit: 0, logistics: {}, proposal: null }] })
        if (fromSubId) get()._cloneSubContent(fromSubId, projectId, sid)
        else {
          const idx = getIndex(get())
          const { planning, usage } = defaultPeriods(projectId, sid, idx)
          get().upsert('equipmentGroups', { id: uid('g_'), projectId, subprojectId: sid, name: 'Matériel', sort: 0, planningPeriodId: planning?.id || null, usagePeriodId: usage?.id || null, planStart: null, planEnd: null, useStart: null, useEnd: null, remark: '' })
        }
        return sid
      },

      removeSubproject: (sid) => {
        const s = get()
        const own = (x) => x.subprojectId === sid
        set({
          subprojects: s.subprojects.filter((x) => x.id !== sid),
          ...Object.fromEntries(['periods', 'equipmentGroups', 'plannedEquipment', 'bookings', 'functionGroups', 'functions', 'assignments', 'costs'].map((c) => [c, s[c].filter((x) => !own(x))])),
        })
      },

      setSubStatus: (sid, status) => {
        get().applySaleStock([sid], status)
        get().patch('subprojects', sid, { status })
      },
      setProjectStatus: (pid, status) => {
        // Les propositions écartées restent annulées
        const mine = (x) => x.projectId === pid && x.proposal?.state !== 'ecartee'
        get().applySaleStock(get().subprojects.filter(mine).map((x) => x.id), status)
        set({ subprojects: get().subprojects.map((x) => (mine(x) ? { ...x, status } : x)) })
      },

      // ---------- Propositions A, B, C… ----------
      /** Nouvelle proposition à partir d'un sous-projet (copie de son contenu, ou vierge) ; le sous-projet devient A. */
      createProposal: (subId, { blank = false, name } = {}) => {
        const s = get()
        const sub = s.subprojects.find((x) => x.id === subId)
        if (!sub) return null
        let setId = sub.proposal?.set
        if (!setId) {
          setId = uid('ps_')
          get().patch('subprojects', sub.id, { proposal: { set: setId, label: 'A', state: 'ouverte' } })
        }
        const labels = get().subprojects.filter((x) => x.proposal?.set === setId).map((x) => x.proposal.label)
        const label = nextLabel(labels)
        const sid = get().addSubproject(sub.projectId, name || `Proposition ${label}`, blank ? null : sub.id)
        // Une nouvelle proposition repart du statut des propositions encore ouvertes (pas d'une écartée)
        const status = sub.proposal?.state === 'ecartee' ? sub.proposal.prevStatus || 'concept' : sub.status
        get().patch('subprojects', sid, { proposal: { set: setId, label, state: 'ouverte' }, status: status === 'annule' ? 'concept' : status })
        return sid
      },
      /** Le client choisit une proposition : elle est retenue, les autres du jeu sont écartées (annulées). */
      chooseProposal: (subId) => {
        const s = get()
        const sub = s.subprojects.find((x) => x.id === subId)
        if (!sub?.proposal?.set) return
        for (const x of s.subprojects.filter((y) => y.proposal?.set === sub.proposal.set)) {
          if (x.id === subId) get().patch('subprojects', x.id, { proposal: { ...x.proposal, state: 'retenue' }, status: x.status === 'annule' ? x.proposal.prevStatus || 'concept' : x.status })
          else if (x.proposal.state !== 'ecartee') get().patch('subprojects', x.id, { proposal: { ...x.proposal, state: 'ecartee', prevStatus: x.status }, status: 'annule' })
        }
      },
      /** Rouvre le choix : toutes les propositions du jeu redeviennent proposées. */
      reopenProposals: (setId) => {
        for (const x of get().subprojects.filter((y) => y.proposal?.set === setId)) {
          get().patch('subprojects', x.id, { proposal: { set: x.proposal.set, label: x.proposal.label, state: 'ouverte' }, status: x.proposal.state === 'ecartee' ? x.proposal.prevStatus || 'concept' : x.status })
        }
      },
      /** Supprime une proposition ; la dernière restante redevient un sous-projet ordinaire. */
      removeProposal: (subId) => {
        const sub = get().subprojects.find((x) => x.id === subId)
        if (!sub) return
        get().removeSubproject(subId)
        const left = get().subprojects.filter((x) => x.proposal?.set && x.proposal.set === sub.proposal?.set)
        if (left.length === 1) get().patch('subprojects', left[0].id, { proposal: null, status: left[0].status === 'annule' ? left[0].proposal.prevStatus || 'concept' : left[0].status })
      },
      /** Après le choix : supprime les propositions écartées, la retenue redevient un sous-projet ordinaire. */
      keepRetainedOnly: (setId) => {
        const list = get().subprojects.filter((x) => x.proposal?.set === setId)
        const kept = list.find((x) => x.proposal.state === 'retenue')
        if (!kept) return
        for (const x of list) if (x.id !== kept.id) get().removeSubproject(x.id)
        get().patch('subprojects', kept.id, { proposal: null })
      },
      /**
       * Articles de vente : déduits du stock quand un sous-projet passe à « Retourné », remis s'il en ressort.
       * Avec la base, c'est elle qui s'en charge (déclencheur subprojects_stock_vente), quel que soit le rôle.
       */
      applySaleStock: (subIds, status) => {
        if (DB_ENABLED) return
        const s = get()
        const delta = {}
        for (const sid of subIds) {
          const sub = s.subprojects.find((x) => x.id === sid)
          if (!sub || (sub.status === 'retourne') === (status === 'retourne')) continue
          const sign = status === 'retourne' ? -1 : 1
          for (const l of s.plannedEquipment) {
            if (l.subprojectId !== sid || l.isOptional) continue
            const eq = s.equipment.find((e) => e.id === l.equipmentId)
            if (eq?.kind === 'vente' && !eq.serialized) delta[eq.id] = (delta[eq.id] || 0) + sign * (Number(l.quantity) || 0)
          }
        }
        for (const [id, d] of Object.entries(delta)) {
          if (d) get().patch('equipment', id, { stock: (Number(s.equipment.find((e) => e.id === id)?.stock) || 0) + d })
        }
      },

      /** Configuration › Modèles de projets : matériel et fonctions pré-remplis. */
      applyProjectTemplate: (projectId, subprojectId, tpl) => {
        const group = get().equipmentGroups.find((g) => g.subprojectId === subprojectId)
        if (group) for (const it of tpl.items || []) if (get().equipment.some((e) => e.id === it.equipmentId)) get().addEquipmentLine(group.id, it.equipmentId, it.quantity)
        const defs = (tpl.functions || []).map((id) => get().defaultFunctions.find((d) => d.id === id)).filter(Boolean)
        if (defs.length) {
          const fg = get().addFunctionGroup(projectId, subprojectId, 'Équipe')
          for (const d of defs) get().addFunction(projectId, subprojectId, fg.id, d)
        }
        // Coûts supplémentaires par défaut repris du modèle
        const costs = (tpl.costs || []).map((id) => get().defaultCosts.find((d) => d.id === id)).filter(Boolean)
        costs.forEach((d, i) => get().upsert('costs', { id: uid('cs_'), projectId, subprojectId, name: d.name, quantity: d.quantity ?? 1, price: d.price ?? 0, cost: d.cost ?? 0, discount: 0, remark: '', sort: i }))
      },

      // ---------- Matériel planifié ----------
      addEquipmentGroup: (projectId, subprojectId, name) => {
        const idx = getIndex(get())
        const { planning, usage } = defaultPeriods(projectId, subprojectId, idx)
        const sort = (idx.groupsBySub[subprojectId] || []).length
        return get().upsert('equipmentGroups', { id: uid('g_'), projectId, subprojectId, name: name || `Groupe ${sort + 1}`, sort, planningPeriodId: planning?.id || null, usagePeriodId: usage?.id || null, planStart: null, planEnd: null, useStart: null, useEnd: null, remark: '' })
      },

      /** Ajoute un article (et son contenu / ses accessoires) dans un groupe. */
      addEquipmentLine: (groupId, equipmentId, quantity = 1) => {
        const s = get()
        const g = s.equipmentGroups.find((x) => x.id === groupId)
        const eq = s.equipment.find((x) => x.id === equipmentId)
        if (!g || !eq) return
        const lines = [...s.plannedEquipment]
        const base = { projectId: g.projectId, subprojectId: g.subprojectId, groupId, name: null, discount: 0, isOptional: false, reservedQty: 0, serialIds: [], remark: '' }
        const sortStart = lines.filter((l) => l.groupId === groupId).length
        let parent = lines.find((l) => l.groupId === groupId && l.equipmentId === equipmentId && l.relation === 'principal')
        if (parent) {
          parent = { ...parent, quantity: (Number(parent.quantity) || 0) + quantity }
          const i = lines.findIndex((l) => l.id === parent.id)
          lines[i] = parent
        } else {
          parent = { ...base, id: uid('pe_'), equipmentId, parentId: null, relation: 'principal', quantity, price: null, sort: sortStart }
          lines.push(parent)
        }
        const children = [...(eq.contents || []).map((c) => ({ ...c, relation: 'contenu', price: 0 })), ...(eq.accessories || []).map((a) => ({ ...a, relation: 'accessoire', price: a.free ? 0 : null }))]
        children.forEach((c, k) => {
          const i = lines.findIndex((l) => l.parentId === parent.id && l.equipmentId === c.equipmentId && l.relation === c.relation)
          if (i >= 0) lines[i] = { ...lines[i], quantity: c.quantity * parent.quantity }
          else lines.push({ ...base, id: uid('pe_'), equipmentId: c.equipmentId, parentId: parent.id, relation: c.relation, quantity: c.quantity * parent.quantity, price: c.price, sort: sortStart + k + 1 })
        })
        set({ plannedEquipment: lines })
      },

      setLineQuantity: (lineId, quantity) => {
        const s = get()
        const line = s.plannedEquipment.find((l) => l.id === lineId)
        if (!line) return
        const eq = s.equipment.find((e) => e.id === line.equipmentId)
        const defs = [...(eq?.contents || []).map((c) => ({ ...c, relation: 'contenu' })), ...(eq?.accessories || []).map((a) => ({ ...a, relation: 'accessoire' }))]
        set({
          plannedEquipment: s.plannedEquipment.map((l) => {
            // Pas plus de numéros de série attribués que d'unités
            if (l.id === lineId) return { ...l, quantity, serialIds: (l.serialIds || []).slice(0, Math.max(0, quantity)) }
            if (l.parentId === lineId) {
              const d = defs.find((x) => x.equipmentId === l.equipmentId && x.relation === l.relation)
              if (d) return { ...l, quantity: d.quantity * quantity }
            }
            return l
          }),
        })
      },

      removeLines: (ids) => set({ plannedEquipment: get().plannedEquipment.filter((l) => !ids.includes(l.id) && !ids.includes(l.parentId)) }),

      /** Ajoute une ligne temporaire (article hors base de données). */
      addTemporaryLine: (groupId, name, price) => {
        const g = get().equipmentGroups.find((x) => x.id === groupId)
        if (!g) return
        get().upsert('plannedEquipment', { id: uid('pe_'), projectId: g.projectId, subprojectId: g.subprojectId, groupId, equipmentId: null, parentId: null, relation: 'principal', name, quantity: 1, price, discount: 0, isOptional: false, reservedQty: 0, serialIds: [], sort: 999, remark: '' })
      },

      // ---------- Équipe et transport ----------
      addFunctionGroup: (projectId, subprojectId, name) => {
        const idx = getIndex(get())
        const { planning, usage } = defaultPeriods(projectId, subprojectId, idx)
        return get().upsert('functionGroups', { id: uid('fg_'), projectId, subprojectId, name: name || 'Groupe de fonctions', sort: (idx.fgroupsBySub[subprojectId] || []).length, planningPeriodId: planning?.id || null, usagePeriodId: usage?.id || null })
      },

      addFunction: (projectId, subprojectId, groupId, fromDefault) => {
        const def = fromDefault || { kind: 'equipe', name: 'Nouvelle fonction', price: 0, priceType: 'heure', cost: 0, costType: 'heure', breakMinutes: 0, tags: [] }
        const n = get().functions.filter((f) => f.subprojectId === subprojectId).length
        return get().upsert('functions', {
          id: uid('fn_'),
          projectId,
          subprojectId,
          groupId: groupId || null,
          kind: def.kind,
          name: def.name,
          internalName: def.internalName || def.name,
          quantity: 1,
          planningPeriodId: null,
          usagePeriodId: null,
          planStart: null,
          planEnd: null,
          useStart: null,
          useEnd: null,
          breakMinutes: def.breakMinutes || 0,
          priceType: def.priceType,
          price: def.price,
          costType: def.costType,
          cost: def.cost,
          distanceKm: 0,
          travelMinutes: 0,
          tags: def.tags || [],
          remark: '',
          sort: n,
        })
      },

      /** Affecte une personne ou un véhicule à une fonction ; shifts : créneaux (horaires et jours différents). */
      assign: (functionId, { crewId = null, vehicleId = null, visible = true, shifts = [] } = {}) => {
        const f = get().functions.find((x) => x.id === functionId)
        if (!f) return null
        return get().upsert('assignments', { id: uid('as_'), projectId: f.projectId, subprojectId: f.subprojectId, functionId, crewId, vehicleId, planStart: null, planEnd: null, shifts, rate: null, visible, invitation: 'aucune', remark: '' })
      },

      removeFunction: (fid) => set({ functions: get().functions.filter((f) => f.id !== fid), assignments: get().assignments.filter((a) => a.functionId !== fid) }),

      // ---------- Entrepôt ----------
      setBooking: (subprojectId, equipmentId, patch) => {
        const s = get()
        const id = `${subprojectId}:${equipmentId}`
        const sub = s.subprojects.find((x) => x.id === subprojectId)
        const cur = s.bookings.find((b) => b.id === id) || { id, projectId: sub.projectId, subprojectId, equipmentId, pret: 0, surSite: 0, retourne: 0, perdu: 0 }
        const next = { ...cur, ...patch }
        for (const k of ['pret', 'surSite', 'retourne', 'perdu']) next[k] = Math.max(0, Number(next[k]) || 0)
        get().upsert('bookings', next)
        // Matériel perdu : le stock baisse (remonte si la perte est annulée) ; avec la base, son déclencheur s'en charge
        const lost = next.perdu - (Number(cur.perdu) || 0)
        const eq = s.equipment.find((e) => e.id === equipmentId)
        if (!DB_ENABLED && lost && eq && eq.kind !== 'vente' && eq.type !== 'kit' && !eq.serialized) get().patch('equipment', eq.id, { stock: (Number(eq.stock) || 0) - lost })
      },

      /** Déplace des unités d'un statut d'entrepôt vers le suivant (À préparer → Prêt → Sur site → Retourné). */
      book: (subprojectId, equipmentId, to, qty) => {
        const wh = subWarehouse(subprojectId, getIndex(get()))
        const row = wh.rows.find((r) => r.equipmentId === equipmentId)
        if (!row) return
        // Sources possibles, dans l'ordre : le « Sur site » prend d'abord le matériel déjà prêt
        const sources = { pret: ['aPreparer'], surSite: ['pret', 'aPreparer'], retourne: ['surSite'], perdu: ['surSite'] }[to]
        let left = qty
        const patch = { [to]: row[to] }
        for (const src of sources) {
          const moved = Math.min(left, row[src])
          if (moved <= 0) continue
          left -= moved
          patch[to] += moved
          if (src !== 'aPreparer') patch[src] = row[src] - moved
        }
        if (patch[to] !== row[to]) get().setBooking(subprojectId, equipmentId, patch)
      },

      bookAll: (subprojectId, to) => {
        const wh = subWarehouse(subprojectId, getIndex(get()))
        for (const r of wh.rows) get().book(subprojectId, r.equipmentId, to, r.needed)
      },

      // ---------- Documents ----------
      /** Génère un document ; options : sous-projets, modèle, en-tête, texte, sujet, nom de fichier, numéro… */
      createDocument: (projectId, type, { number, ...options } = {}) => {
        const s = get().settings
        const custom = String(number || '').trim()
        const doc = buildDocument(projectId, type, get(), {
          templateId: defaultTemplateId(s, type),
          letterheadId: defaultLetterheadId(s, type),
          ...options,
          ...(custom ? { number: custom } : {}),
        })
        // Un numéro saisi à la main ne consomme pas la série (les documents non financiers n'en ont pas)
        if (!custom && DOC_SERIES[type]) get().takeNumber(DOC_SERIES[type][1])
        get().upsert('documents', doc)
        return doc
      },

      regenerateDocument: (docId) => {
        const s = get()
        const doc = s.documents.find((d) => d.id === docId)
        if (!doc?.projectId) return
        // Facture complémentaire de frais de retour : refaite à partir de ses frais, pas du contenu du projet
        const fees = s.returnCharges.filter((c) => c.invoiceId === docId)
        if (fees.length) {
          // Le texte du document saisi par l'utilisateur est conservé
          const { body, ...parts } = feeInvoiceParts(s, fees[0].subprojectId, fees) // eslint-disable-line no-unused-vars
          get().patch('documents', docId, { ...parts, version: (doc.version || 1) + 1 })
          return
        }
        const fresh = buildDocument(doc.projectId, doc.type, s, { subprojectIds: doc.subprojectIds })
        get().patch('documents', docId, { sections: fresh.sections, totals: fresh.totals, days: fresh.days, content: fresh.content, version: (doc.version || 1) + 1 })
      },

      /** Signature numérique : le document est accepté et les sous-projets en option passent à Confirmé. */
      signDocument: (docId, { name, email = '', comment = '', image = null, proposalSubId = null }) => {
        const doc = get().documents.find((d) => d.id === docId)
        if (!doc) return null
        const signedAt = new Date().toISOString()
        // Devis à propositions : la proposition choisie est retenue, ses montants deviennent ceux du document
        const offered = doc.content?.proposals || []
        const chosen = offered.find((p) => p.subprojectId === proposalSubId)
        get().patch('documents', docId, {
          signature: { name, email, comment, image, signedAt, ...(chosen ? { proposal: { subprojectId: chosen.subprojectId, label: chosen.label, name: chosen.name } } : {}) },
          signedAt,
          status: 'accepte',
          ...(chosen?.docTotals ? { totals: chosen.docTotals } : {}),
        })
        if (chosen) get().chooseProposal(chosen.subprojectId)
        if (doc.type === 'devis' || doc.type === 'contrat') {
          const dropped = new Set(offered.filter((p) => p.subprojectId !== chosen?.subprojectId).map((p) => p.subprojectId))
          for (const sid of doc.subprojectIds || []) {
            if (chosen && dropped.has(sid)) continue
            const sub = get().subprojects.find((x) => x.id === sid)
            if (sub && ['demande', 'concept', 'option'].includes(sub.status)) get().patch('subprojects', sid, { status: 'confirme' })
          }
        }
        return signedAt
      },

      convertQuoteToInvoice: (docId) => {
        const s = get()
        const quote = s.documents.find((d) => d.id === docId)
        if (!quote) return null
        const n = get().takeNumber('nextInvoiceNumber')
        const today = new Date()
        const keepLh = letterheadsFor(s.settings, 'facture').some((l) => l.id === quote.letterheadId)
        const invoice = {
          ...structuredClone(quote),
          id: uid('doc_'),
          type: 'facture',
          number: `${s.settings.invoicePrefix}${today.getFullYear()}-${String(n).padStart(4, '0')}`,
          version: 1,
          date: toDateInput(today),
          dueDate: toDateInput(addDays(today, s.settings.paymentTermDays || 30)),
          status: 'brouillon',
          notes: s.settings.invoiceTerms,
          fromQuote: quote.id,
          payments: [],
          signedAt: null,
          signature: null,
          templateId: defaultTemplateId(s.settings, 'facture'),
          letterheadId: keepLh ? quote.letterheadId : defaultLetterheadId(s.settings, 'facture'),
          body: null,
          subject: null,
          fileName: null,
          content: quote.content || (quote.projectId ? buildContent(quote.projectId, quote.subprojectIds || [], getIndex(s), s) : null),
          createdAt: today.toISOString(),
        }
        set({ documents: [...replaceIn(get().documents, docId, { status: 'accepte' }), invoice] })
        return invoice
      },

      createCreditNote: (invoiceId) => {
        const s = get()
        const inv = s.documents.find((d) => d.id === invoiceId)
        if (!inv) return null
        const n = get().takeNumber('nextCreditNumber')
        const today = new Date()
        const credit = {
          ...structuredClone(inv),
          id: uid('doc_'),
          type: 'avoir',
          number: `${s.settings.creditPrefix}${today.getFullYear()}-${String(n).padStart(4, '0')}`,
          date: toDateInput(today),
          dueDate: toDateInput(today),
          status: 'brouillon',
          payments: [],
          fromQuote: inv.id,
          createdAt: today.toISOString(),
          notes: `Note de crédit relative à la facture ${inv.number}.`,
          templateId: defaultTemplateId(s.settings, 'avoir'),
          letterheadId: letterheadsFor(s.settings, 'avoir').some((l) => l.id === inv.letterheadId) ? inv.letterheadId : defaultLetterheadId(s.settings, 'avoir'),
          body: null,
          subject: null,
          fileName: null,
          signature: null,
          signedAt: null,
        }
        get().upsert('documents', credit)
        return credit
      },

      addPayment: (docId, amount, date, method = 'Virement') => {
        const doc = get().documents.find((d) => d.id === docId)
        if (!doc) return
        const payments = [...(doc.payments || []), { date, amount, method }]
        const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
        const due = documentAmounts(doc).total
        get().patch('documents', docId, { payments, status: paid >= due - 0.01 ? 'payee' : 'partiel' })
      },

      // ---------- Sous-locations, bons de commande, réparations ----------
      createSubrent: (data) => {
        const n = get().takeNumber('nextSubrentNumber')
        const year = new Date().getFullYear()
        return get().upsert('subrents', { id: uid('sr_'), number: `${get().settings.subrentPrefix}${year}-${String(n).padStart(4, '0')}`, status: 'demande', lines: [], cost: 0, notes: '', createdAt: new Date().toISOString(), supplierId: null, projectId: null, startsAt: null, endsAt: null, ...data })
      },

      createPurchaseOrder: (data) => {
        const n = get().takeNumber('nextPoNumber')
        const year = new Date().getFullYear()
        const lines = data.lines || []
        return get().upsert('purchaseOrders', { id: uid('po_'), number: `${get().settings.poPrefix}${year}-${String(n).padStart(4, '0')}`, date: toDateInput(new Date()), status: 'brouillon', notes: '', supplierId: null, projectId: null, subrentId: null, ...data, lines, total: lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0) })
      },

      // ---------- Numéros de série ----------
      /** Complète les numéros de série des lignes avec des unités libres sur leur période ; renvoie le nombre attribué. */
      autoAssignSerials: (lineIds) => {
        let n = 0
        for (const id of lineIds) {
          const s = get()
          const line = s.plannedEquipment.find((l) => l.id === id)
          if (!line || !s.equipment.find((e) => e.id === line.equipmentId)?.serialized) continue
          const missing = (Number(line.quantity) || 0) - (line.serialIds || []).length
          if (missing <= 0) continue
          const picks = availableSerials(line, getIndex(s)).slice(0, missing).map((x) => x.id)
          if (!picks.length) continue
          get().patch('plannedEquipment', id, { serialIds: [...(line.serialIds || []), ...picks] })
          n += picks.length
        }
        return n
      },

      // ---------- Préparation et retour du matériel ----------
      /** Détails d'un article (part : « prep » ou « ret ») : numéros de série cochés, état au retour, notes. */
      setBookingDetails: (subprojectId, equipmentId, part, patch) => {
        const b = get().bookings.find((x) => x.id === `${subprojectId}:${equipmentId}`)
        const details = b?.details || {}
        get().setBooking(subprojectId, equipmentId, { details: { ...details, [part]: { ...(details[part] || {}), ...patch } } })
      },
      /** Étapes d'un sous-projet (part : « prep », « out » ou « ret ») ; null efface l'étape. */
      setLogistics: (subId, part, patch) => {
        const sub = get().subprojects.find((x) => x.id === subId)
        if (!sub) return
        const lg = { ...(sub.logistics || {}) }
        if (patch === null) delete lg[part]
        else lg[part] = { ...(lg[part] || {}), ...patch }
        get().patch('subprojects', subId, { logistics: lg })
      },
      addReturnCharge: (subId, data) => {
        const sub = get().subprojects.find((x) => x.id === subId)
        if (!sub) return null
        return get().upsert('returnCharges', { id: uid('rc_'), projectId: sub.projectId, subprojectId: subId, equipmentId: null, kind: 'autre', label: 'Frais', quantity: 1, price: 0, note: '', status: 'a_facturer', costId: null, invoiceId: null, createdBy: currentUserName(), createdAt: new Date().toISOString(), ...data })
      },
      /** Ajoute des frais de retour aux coûts supplémentaires du projet : la prochaine facture du projet les reprend. */
      chargesToCosts: (ids) => {
        let n = 0
        for (const id of ids) {
          const s = get()
          const c = s.returnCharges.find((x) => x.id === id)
          if (!c) continue
          const eq = s.equipment.find((e) => e.id === c.equipmentId)
          const sort = s.costs.filter((x) => x.subprojectId === c.subprojectId).length
          const cost = get().upsert('costs', { id: uid('cs_'), projectId: c.projectId, subprojectId: c.subprojectId, name: c.label, quantity: Number(c.quantity) || 0, price: Number(c.price) || 0, cost: 0, discount: 0, remark: ['Frais de retour', eq && !c.label.includes(eq.name) ? eq.name : null, c.note].filter(Boolean).join(' · '), sort })
          get().patch('returnCharges', id, { status: 'ajoute', costId: cost.id, invoiceId: null })
          n++
        }
        return n
      },
      /** Facture complémentaire ne contenant que des frais de retour (ils ne sont pas ajoutés aux coûts du projet). */
      invoiceCharges: (subId, ids) => {
        const s = get()
        const sub = s.subprojects.find((x) => x.id === subId)
        const fees = s.returnCharges.filter((c) => ids.includes(c.id))
        if (!sub || !fees.length) return null
        const doc = get().createDocument(sub.projectId, 'facture', { subprojectIds: [subId], ...feeInvoiceParts(s, subId, fees) })
        for (const c of fees) get().patch('returnCharges', c.id, { status: 'facture', invoiceId: doc.id, costId: null })
        return doc
      },

      createRepair: (data) => {
        const n = get().takeNumber('nextRepairNumber')
        const year = new Date().getFullYear()
        return get().upsert('repairs', { id: uid('rep_'), number: `${get().settings.repairPrefix}${year}-${String(n).padStart(4, '0')}`, quantity: 1, title: '', description: '', status: 'en_cours', startsAt: toLocalInput(new Date()), endsAt: null, unavailable: true, cost: 0, reporter: currentUserName(), repairer: '', projectId: null, serialId: null, createdAt: new Date().toISOString(), ...data })
      },

      /** Transforme une demande entrante en projet (statut Demande) avec son matériel. */
      convertRequest: (requestId) => {
        const s = get()
        const rq = s.requests.find((r) => r.id === requestId)
        if (!rq) return null
        let clientId = s.contacts.find((c) => (rq.email && c.email === rq.email) || (rq.company && c.company === rq.company))?.id
        if (!clientId) {
          clientId = uid('c_')
          const [firstName, ...rest] = (rq.contactName || '').split(' ')
          get().upsert('contacts', { id: clientId, type: 'client', isCompany: Boolean(rq.company), company: rq.company || null, firstName, lastName: rest.join(' '), email: rq.email || '', phone: rq.phone || '', website: '', address: '', zip: '', city: '', country: s.settings.country || 'France', vatNumber: '', discountEquipment: 0, discountCrew: 0, paymentTermDays: null, notes: 'Créé depuis une demande de projet.', tags: [], createdAt: new Date().toISOString() })
        }
        const start = new Date(rq.startsAt)
        const end = new Date(rq.endsAt)
        const { projectId, subprojectId } = get().createProject({
          name: rq.eventName || 'Demande',
          clientId,
          status: 'demande',
          planStart: toLocalInput(addDays(start, -1)),
          planEnd: toLocalInput(addDays(end, 1)),
          useStart: rq.startsAt,
          useEnd: rq.endsAt,
        })
        const group = get().equipmentGroups.find((g) => g.subprojectId === subprojectId)
        for (const it of rq.items || []) get().addEquipmentLine(group.id, it.equipmentId, it.quantity)
        get().patch('projects', projectId, { notes: rq.message || '' })
        get().patch('requests', requestId, { status: 'acceptee', projectId })
        return projectId
      },

      // ---------- Données ----------
      exportData: () => {
        const s = get()
        return { settings: s.settings, ...Object.fromEntries(COLLECTIONS.map((c) => [c, s[c]])) }
      },
      importData: (data) => {
        const patch = {}
        for (const k of [...COLLECTIONS, 'settings']) if (data[k]) patch[k] = data[k]
        set(patch)
      },
    }),
    {
      name: 'rentplan-v3',
      version: 3,
      storage: createJSONStorage(() => (DB_ENABLED ? noStorage : localStorage)),
      partialize: (s) => ({ settings: s.settings, ...Object.fromEntries(COLLECTIONS.map((c) => [c, s[c]])) }),
      merge: (persisted, current) => ({ ...current, ...(persisted || {}), settings: { ...current.settings, ...(persisted?.settings || {}) } }),
    },
  ),
)

/** Index mémorisé de toutes les relations (à utiliser dans les composants). */
export const useIdx = () => getIndex(useStore())

// ---------- Garde des droits : toute modification non autorisée est annulée localement ----------
let systemDepth = 0
/** Écritures « système » (chargement, temps réel, réinitialisation) : jamais bloquées par la garde. */
const systemWrite = (fn) => {
  systemDepth++
  try {
    return fn()
  } finally {
    systemDepth--
  }
}
const COUNTER = /^next[A-Z]/
const onlyCounters = (a = {}, b = {}) => [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => COUNTER.test(k) || a[k] === b[k])

/** Un membre du personnel ne change que la réponse à ses propres invitations. */
function onlyOwnInvitations(prev, next, crewId) {
  if (!crewId || prev.length !== next.length) return false
  const before = new Map(prev.map((a) => [a.id, a]))
  return next.every((a) => {
    const b = before.get(a.id)
    if (!b) return false
    if (a === b) return true
    if (b.crewId !== crewId) return false
    const { invitation: _x, ...ra } = a
    const { invitation: _y, ...rb } = b
    return JSON.stringify(ra) === JSON.stringify(rb)
  })
}

let reverting = false
let lastDenied = { text: '', at: 0 }
useStore.subscribe((state, prev) => {
  if (systemDepth || reverting || state === prev || useAuth.getState().status !== 'ready') return
  const access = currentAccess()
  const revert = {}
  let blocked = null
  for (const c of COLLECTIONS) {
    if (state[c] === prev[c] || access.canEditCollection(c)) continue
    if (c === 'assignments' && onlyOwnInvitations(prev[c], state[c], access.crewId)) continue
    revert[c] = prev[c]
    blocked ||= c
  }
  if (state.settings !== prev.settings && !access.can('configuration', 'modification') && !onlyCounters(prev.settings, state.settings)) {
    revert.settings = prev.settings
    blocked ||= 'settings'
  }
  if (!blocked) return
  reverting = true
  try {
    useStore.setState(revert)
  } finally {
    reverting = false
  }
  const module = blocked === 'settings' ? 'configuration' : (COLLECTION_MODULES[blocked] || ['configuration'])[0]
  const text = `Lecture seule : votre rôle « ${access.roleName} » ne permet pas de modifier « ${MODULE_BY_ID[module]?.label} ».`
  if (text !== lastDenied.text || Date.now() - lastDenied.at > 1500) toast(text, 'error')
  lastDenied = { text, at: Date.now() }
})

// ---------- Démarrage (après la connexion) ----------
let syncHandle = null

const syncOptions = {
  apply: (patch) => systemWrite(() => useStore.setState(patch)),
  author: currentUserName,
  // Collections que le rôle ne peut modifier qu'en partie (réponse à ses invitations)
  partial: (collection) => !currentAccess().canEditCollection(collection),
  onError: (e) => toast(`Erreur d’enregistrement : ${e.message}`, 'error'),
  onDenied: async (e) => {
    const data = await loadAll()
    if (data) systemWrite(() => useStore.setState(data))
    toast(isDenied(e) ? 'Modification refusée par la base (droits insuffisants) : les données ont été rechargées.' : `Enregistrement impossible (${e.message}) : les données ont été rechargées.`, 'error')
  },
}
const restartSync = () => {
  syncHandle?.stop()
  syncHandle = startSync(useStore, syncOptions)
}

/** Charge les données du compte connecté (et prépare un espace de travail neuf si la base est vide). */
export async function boot(profile) {
  useRecent.getState().load(profile?.id)
  useClock.getState().load(profile?.id)
  if (!DB_ENABLED) return
  systemWrite(() => useStore.setState({ ready: false, bootError: null }))
  useSyncStatus.setState({ state: 'loading' })
  try {
    let data = await loadAll()
    const seeded = !data
    if (seeded) data = firstWorkspace()
    systemWrite(() => useStore.setState({ ...data, ready: true, bootError: null }))
    if (seeded) {
      useSyncStatus.setState({ state: 'saving' })
      await flush(useStore.getState(), 'Import')
    }
    useSyncStatus.setState({ state: 'saved', savedAt: new Date() })
    restartSync()
  } catch (e) {
    console.error(e)
    useSyncStatus.setState({ state: 'error', error: e.message })
    systemWrite(() => useStore.setState({ ready: true, bootError: e.message || String(e) }))
  }
}

/** Déconnexion : arrêt de la synchronisation et effacement des données de la mémoire. */
export function shutdown() {
  syncHandle?.stop()
  syncHandle = null
  systemWrite(() => useStore.setState({ ...emptyData(), ready: false, bootError: null }))
  useRecent.getState().load(null)
  useClock.getState().load(null)
}

const requireConfiguration = () => {
  if (!currentAccess().can('configuration', 'modification')) throw new Error('Votre rôle ne permet pas de remplacer les données.')
}

// ---------- Espace de travail vierge (premier démarrage, « Repartir de zéro ») ----------
const COUNTERS = Object.keys(DEFAULT_SETTINGS).filter((k) => /^next[A-Z]\w*Number$/.test(k))
/** Collections qui font partie de la configuration (dossiers, emplacements, types, fonctions et coûts par défaut). */
export const CONFIG_COLLECTIONS = ['categories', 'stockLocations', 'projectTypes', 'defaultFunctions', 'defaultCosts']
// Identité de l'entreprise de démonstration, effacée quand la configuration n'est pas conservée
const BLANK_COMPANY = { companyName: '', address: '', zip: '', city: '', phone: '', email: '', website: '', siret: '', vatNumber: '', iban: '', bic: '', bankName: '', accountHolder: '', logoUrl: '' }

/** Réglages par défaut, sans l'identité ni les modèles de l'entreprise de démonstration. */
const blankSettings = () => ({
  ...DEFAULT_SETTINGS,
  ...BLANK_COMPANY,
  projectTemplates: [],
  customFields: [],
  emailSettings: { ...DEFAULT_SETTINGS.emailSettings, senderName: '', replyTo: '', signature: '' },
  letterheads: DEFAULT_LETTERHEADS.map((l) => (l.auto ? { ...l, auto: { ...l.auto, tagline: '' } } : l)),
})

/**
 * Premier démarrage sur une base vide : espace de travail sans données, avec la configuration de base
 * (dossiers d'équipements, types de projets, fonctions et coûts par défaut) et un entrepôt principal.
 * setupPending ouvre l'assistant de première configuration pour le premier administrateur.
 */
function firstWorkspace() {
  const seed = createSeed()
  const settings = { ...blankSettings(), setupPending: true }
  for (const k of COUNTERS) settings[k] = 1
  return {
    ...emptyData(),
    settings,
    categories: seed.categories,
    projectTypes: seed.projectTypes,
    defaultFunctions: seed.defaultFunctions,
    defaultCosts: seed.defaultCosts,
    stockLocations: [{ id: 'sl_principal', name: 'Entrepôt principal', address: '', kind: 'entrepot', isDefault: true, archived: false }],
  }
}

/** Fichiers stockés par la configuration : logo et fonds des en-têtes de documents. */
const configFiles = (settings) => [
  storagePathOf(settings.logoUrl),
  ...(settings.letterheads || []).flatMap((l) => [storagePathOf(l.background?.source), ...(l.background?.pages || []).map(storagePathOf)]),
].filter(Boolean)

/**
 * Efface toutes les données pour repartir de zéro. Les comptes utilisateurs et les rôles sont toujours conservés.
 * keepConfig : garde la configuration ; resetCounters : numéros repris à 1 ; removeFiles : fichiers stockés supprimés.
 */
export async function resetToEmpty({ keepConfig = true, resetCounters = true, removeFiles = true } = {}) {
  const access = currentAccess()
  if (!access.admin || !access.can('configuration', 'modification')) throw new Error('Seul un administrateur peut effacer toutes les données.')
  const cur = useStore.getState()
  const settings = keepConfig ? { ...cur.settings } : blankSettings()
  if (resetCounters) for (const k of COUNTERS) settings[k] = 1
  const next = { ...emptyData(), settings }
  if (keepConfig) for (const c of CONFIG_COLLECTIONS) next[c] = cur[c]
  const paths = [...cur.files.map((f) => f.path), ...(keepConfig ? [] : configFiles(cur.settings))]
  // Onglets récents et pointage du compte : ils renverraient vers des fiches supprimées
  const clearAccount = () => {
    const r = useRecent.getState()
    for (const t of [...r.tabs]) r.close(t.key)
    useClock.getState().stop()
  }
  if (!DB_ENABLED) {
    systemWrite(() => useStore.setState(next))
    clearAccount()
    return
  }
  syncHandle?.stop()
  useSyncStatus.setState({ state: 'saving' })
  try {
    await wipeAll()
    systemWrite(() => useStore.setState(next))
    await flush(useStore.getState(), 'Import')
    await unlinkCrewAccounts()
    useAuth.setState((s) => (s.profile ? { profile: { ...s.profile, crewId: null } } : {}))
    if (removeFiles) await removeStoredFiles(paths).catch((e) => toast(`Certains fichiers n’ont pas pu être supprimés : ${e.message}`, 'error'))
    useSyncStatus.setState({ state: 'saved', savedAt: new Date() })
  } finally {
    restartSync()
    clearAccount()
  }
}

/** Remplace toutes les données (import JSON) ; avec Supabase, le contenu est aussi poussé en base. */
export async function replaceAllData(data) {
  requireConfiguration()
  if (!DB_ENABLED) {
    systemWrite(() => useStore.getState().importData(data))
    return
  }
  syncHandle?.stop()
  await wipeAll()
  systemWrite(() => useStore.setState({ ...emptyData(), ...data }))
  await flush(useStore.getState(), 'Import')
  restartSync()
}

// ---------- Notifications ----------
export { toast, useToasts } from './lib/toast'

// ---------- Préférences propres au compte et à ce navigateur ----------
const lsGet = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}
const lsSet = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage indisponible : l'état reste en mémoire */
  }
}

/** Fiches récemment ouvertes (onglets de la barre du haut), par compte. */
export const useRecent = create((set, get) => ({
  owner: null,
  tabs: [],
  load: (owner) => set({ owner, tabs: owner ? lsGet(`rentplan-recent:${owner}`, []) : [] }),
  open: (tab) => {
    const { tabs, owner } = get()
    const i = tabs.findIndex((t) => t.key === tab.key)
    const next = i >= 0 ? tabs.map((t) => (t.key === tab.key ? tab : t)) : [tab, ...tabs].slice(0, 6)
    set({ tabs: next })
    if (owner) lsSet(`rentplan-recent:${owner}`, next)
  },
  close: (key) => {
    const { tabs, owner } = get()
    const next = tabs.filter((t) => t.key !== key)
    set({ tabs: next })
    if (owner) lsSet(`rentplan-recent:${owner}`, next)
  },
}))

/** Pointage (chronomètre de la barre du haut), par compte. */
export const useClock = create((set, get) => ({
  owner: null,
  startedAt: null,
  crewId: null,
  load: (owner) => set({ owner, startedAt: null, crewId: null, ...(owner ? lsGet(`rentplan-clock:${owner}`, {}) : {}) }),
  start: (crewId) => {
    set({ startedAt: new Date().toISOString(), crewId })
    if (get().owner) lsSet(`rentplan-clock:${get().owner}`, { startedAt: get().startedAt, crewId })
  },
  stop: () => {
    set({ startedAt: null })
    if (get().owner) lsSet(`rentplan-clock:${get().owner}`, { startedAt: null, crewId: get().crewId })
  },
}))
