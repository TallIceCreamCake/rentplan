// Variables disponibles dans les modèles : arborescence parcourue par le sélecteur « Toutes les variables »
// et par le moteur ({$f.customer.displayname}, {$p.usageperiod_start}, {$sp.name}, {$company.country}…).
import { DOC_TYPES, docStatusOf, paidAmount, projectStatus, projectTimes, statusOf, subTimes, subTotals } from '../model'
import { documentAmounts } from '../documents'
import { contactName, daysSpan, personName } from '../utils'
import { escapeHtml, fmtOptions, renderTemplate, typed } from './engine'

const F = (label, type, get, extra) => ({ label, type, get, ...extra })
const R = (label, ref, get) => ({ label, ref, get })
const hidden = { hidden: true }
const nl2br = (s) => escapeHtml(s || '').replace(/\r?\n/g, '<br>')
const TASK_LABELS = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé' }
const CF_TYPES = { texte: 'text', nombre: 'number', date: 'date', case: 'bool' }

const contactFields = {
  displayname: F('Nom affiché', 'text', (c) => contactName(c)),
  name: F('Nom de la société', 'text', (c) => c.company || ''),
  firstname: F('Prénom', 'text', (c) => c.firstName),
  lastname: F('Nom', 'text', (c) => c.lastName),
  address: F('Adresse', 'text', (c) => c.address),
  zip: F('Code postal', 'text', (c) => c.zip),
  city: F('Ville', 'text', (c) => c.city),
  country: F('Pays', 'text', (c) => c.country),
  email: F('E-mail', 'text', (c) => c.email),
  phone: F('Téléphone', 'text', (c) => c.phone),
  website: F('Site web', 'text', (c) => c.website),
  vat: F('N° TVA', 'text', (c) => c.vatNumber),
  payment_days: F('Délai de paiement (jours)', 'number', (c) => c.paymentTermDays),
  // Noms Rentman, pour les extraits de code de la documentation
  visit_street: F('Rue (visite)', 'text', (c) => c.address, hidden),
  visit_postalcode: F('Code postal (visite)', 'text', (c) => c.zip, hidden),
  visit_city: F('Ville (visite)', 'text', (c) => c.city, hidden),
  visit_country: F('Pays (visite)', 'text', (c) => c.country, hidden),
}

export const SCHEMA = {
  company: {
    label: 'Détails de l’entreprise',
    fields: {
      name: F('Nom', 'text', (s) => s.companyName),
      address: F('Adresse', 'text', (s) => s.address),
      zip: F('Code postal', 'text', (s) => s.zip),
      city: F('Ville', 'text', (s) => s.city),
      country: F('Pays', 'text', (s) => s.country),
      phone: F('Téléphone', 'text', (s) => s.phone),
      email: F('E-mail', 'text', (s) => s.email),
      website: F('Site web', 'text', (s) => s.website),
      siret: F('SIRET', 'text', (s) => s.siret),
      vat: F('N° TVA', 'text', (s) => s.vatNumber),
      iban: F('IBAN', 'text', (s) => s.iban),
      bic: F('BIC', 'text', (s) => s.bic),
      bank: F('Banque', 'text', (s) => s.bankName),
      accountholder: F('Titulaire du compte', 'text', (s) => s.accountHolder || s.companyName),
      logo: F('Logo', 'html', (s) => (s.logoUrl ? `<img src="${escapeHtml(s.logoUrl)}" alt="" style="max-height: 64px; max-width: 220px">` : '')),
    },
  },
  doc: {
    label: 'Document',
    fields: {
      number: F('Numéro', 'text', (d) => d.number),
      version: F('Version', 'number', (d) => d.version || 1),
      type: F('Type de document', 'text', (d) => DOC_TYPES[d.type]?.label),
      date: F('Date', 'date', (d) => d.date),
      duedate: F('Date d’échéance', 'date', (d) => d.dueDate),
      expiry: F('Valable jusqu’au', 'date', (d) => d.dueDate),
      status: F('Statut', 'text', (d) => docStatusOf(d).label),
      subject: F('Sujet', 'text', (d, env) => env.subject || ''),
      // Le texte saisi à la génération peut lui-même contenir des variables
      text: F('Texte du document', 'html', (d, env) => ((env.depth || 0) >= 2 ? '' : renderTemplate(d.body || '', withEnv(env, { depth: (env.depth || 0) + 1 })))),
      price_exvat: F('Prix hors TVA', 'price', (d) => documentAmounts(d).exVat),
      vat: F('TVA', 'price', (d) => documentAmounts(d).vat),
      vat_rate: F('Taux de TVA', 'pct', (d) => d.totals?.vatRate),
      price_invat: F('Prix TTC', 'price', (d) => documentAmounts(d).total),
      discount: F('Remise projet', 'price', (d) => d.totals?.discountTotal),
      insurance: F('Assurance', 'price', (d) => d.totals?.insurance),
      deposit: F('Caution', 'price', (d, env) => (d.subprojectIds || []).reduce((s, id) => s + (Number(env.idx.sub[id]?.deposit) || 0), 0)),
      paid: F('Montant payé', 'price', (d) => paidAmount(d)),
      balance: F('Reste à payer', 'price', (d) => documentAmounts(d).total - paidAmount(d)),
      partial_pct: F('Pourcentage facturé', 'pct', (d) => d.partialPct ?? 100),
      payment_term: F('Conditions de paiement', 'text', (d, env) => {
        const s = env.settings
        const days = env.idx.contact[d.clientId]?.paymentTermDays ?? s.paymentTermDays
        const term = (s.paymentTerms || []).find((t) => Number(t.days) === Number(days))
        return term ? term.name : days != null ? `${days} jours` : ''
      }),
      vat_mention: F('Mention TVA', 'text', (d, env) => {
        const r = (env.settings.vatRegimes || []).find((x) => Number(x.rate) === Number(d.totals?.vatRate) && x.mention)
        return r?.mention || ''
      }),
      greeting: F('Formule d’appel', 'text', (d, env) => {
        const sal = { formal: 'Madame, Monsieur,', personal: 'Bonjour {prénom},', ...(env.settings.salutation || {}) }
        const p = env.idx.person[env.idx.project[d.projectId]?.contactPersonId]
        return sal.usePersonal && p ? sal.personal.replace('{prénom}', p.firstName || '').replace('{nom}', p.lastName || '').trim() : sal.formal
      }),
      closing: F('Phrase de conclusion', 'text', (d, env) => env.settings.salutation?.closing),
      politeness: F('Formule de politesse', 'text', (d, env) => env.settings.salutation?.politeness),
      conditions: F('Conditions', 'html', (d) => nl2br(d.notes)),
      signed_by: F('Signé par', 'text', (d) => d.signature?.name),
      proposals_count: F('Nombre de propositions', 'number', (d) => (d.content?.proposals || []).length),
      chosen_proposal: F('Proposition choisie', 'text', (d) => (d.signature?.proposal ? `Proposition ${d.signature.proposal.label} — ${d.signature.proposal.name}` : '')),
      signed_at: F('Date de signature', 'datetime', (d) => d.signedAt),
      sign_url: F('Lien de signature', 'text', (d) => `${window.location.origin}/signer/${d.id}`),
      quote: F('Devis d’origine', 'text', (d, env) => env.idx.d.documents.find((x) => x.id === d.fromQuote)?.number),
      currency: F('Devise', 'text', (d, env) => env.settings.currency),
      customer: R('Client', 'contact', (d, env) => env.idx.contact[d.clientId] || env.idx.contact[env.idx.project[d.projectId]?.clientId]),
      contact: R('Personne de contact', 'person', (d, env) => env.idx.person[env.idx.project[d.projectId]?.contactPersonId]),
      project: R('Projet', 'project', (d, env) => env.idx.project[d.projectId]),
      order: R('Bon de commande', 'order', (d) => d.order),
      equipment: R('Équipement (étiquette)', 'equipment', (d, env) => env.idx.eq[d.label?.equipmentId]),
      serial: R('Numéro de série (étiquette)', 'serial', (d, env) => env.idx.d.serials.find((x) => x.id === d.label?.serialId)),
    },
  },
  serial: {
    label: 'Numéro de série',
    fields: {
      serial: F('Numéro de série', 'text', (sn) => sn.serial),
      internal_ref: F('Référence interne', 'text', (sn) => sn.internalRef),
      stock_location: F('Emplacement de stock', 'text', (sn, env) => env.idx.location[sn.stockLocationId]?.name),
      purchase_date: F('Date d’achat', 'date', (sn) => sn.purchaseDate),
      status: F('Statut', 'text', (sn) => ({ ok: 'En service', maintenance: 'En maintenance', hs: 'Hors service', perdu: 'Perdu' })[sn.status] || ''),
      notes: F('Notes', 'text', (sn) => sn.notes),
      link: F('Lien vers la fiche', 'text', (sn) => `${window.location.origin}/equipements/${sn.equipmentId}?tab=series&sn=${encodeURIComponent(sn.serial)}`),
      equipment: R('Équipement', 'equipment', (sn, env) => env.idx.eq[sn.equipmentId]),
    },
  },
  order: {
    label: 'Bon de commande',
    fields: {
      number: F('Numéro', 'text', (o) => o.number),
      status: F('Statut', 'text', (o) => o.statusLabel),
      subrent: F('Sous-location', 'text', (o) => o.subrent),
      start: F('Début de la location', 'datetime', (o) => o.start),
      end: F('Fin de la location', 'datetime', (o) => o.end),
      delivery: F('Livraison / enlèvement', 'text', (o) => o.delivery),
      total_exvat: F('Total HT', 'price', (o) => o.totalExVat),
      supplier: R('Fournisseur', 'contact', (o, env) => env.idx.contact[o.supplierId]),
    },
  },
  project: {
    label: 'Projet',
    custom: 'projet',
    fields: {
      id: F('Identifiant', 'text', (p) => p.id, hidden),
      number: F('Numéro', 'text', (p) => p.number),
      name: F('Nom', 'text', (p) => p.name),
      reference: F('Référence externe', 'text', (p) => p.externalRef),
      accountmanager: F('Gestionnaire de compte', 'text', (p) => p.accountManager),
      type: F('Type de projet', 'text', (p, env) => env.idx.type[p.typeId]?.name),
      status: F('Statut', 'text', (p, env) => statusOf(projectStatus(p.id, env.idx).id).label),
      notes: F('Remarque externe', 'text', (p) => p.externalNotes),
      planperiod_start: F('Début de la période de planification', 'datetime', (p, env) => projectTimes(p.id, env.idx).planStart),
      planperiod_end: F('Fin de la période de planification', 'datetime', (p, env) => projectTimes(p.id, env.idx).planEnd),
      usageperiod_start: F('Début de la période d’utilisation', 'datetime', (p, env) => projectTimes(p.id, env.idx).useStart),
      usageperiod_end: F('Fin de la période d’utilisation', 'datetime', (p, env) => projectTimes(p.id, env.idx).useEnd),
      usage_days: F('Nombre de jours d’utilisation', 'number', (p, env) => {
        const t = projectTimes(p.id, env.idx)
        return t.useStart ? daysSpan(t.useStart, t.useEnd) : null
      }),
      customer: R('Client', 'contact', (p, env) => env.idx.contact[p.clientId]),
      location: R('Lieu de la prestation', 'contact', (p, env) => env.idx.contact[p.venueId]),
      contact: R('Personne de contact', 'person', (p, env) => env.idx.person[p.contactPersonId]),
    },
  },
  subproject: {
    label: 'Sous-projet',
    fields: {
      id: F('Identifiant', 'text', (s) => s.id, hidden),
      name: F('Nom', 'text', (s) => s.name),
      status: F('Statut', 'text', (s) => statusOf(s.status).label),
      proposal_label: F('Lettre de la proposition', 'text', (s) => s.proposal?.label || ''),
      proposal_title: F('Proposition (« Proposition A — nom »)', 'text', (s) => (s.proposal?.label ? `Proposition ${s.proposal.label} — ${s.name}` : s.name)),
      conditions: F('Conditions supplémentaires', 'text', (s) => s.additionalConditions),
      price_exvat: F('Prix hors TVA', 'price', (s, env) => subTotals(s.id, env.idx).totalExVat),
      deposit: F('Caution', 'price', (s) => s.deposit),
      usageperiod_start: F('Début de la période d’utilisation', 'datetime', (s, env) => subTimes(s.id, env.idx).useStart),
      usageperiod_end: F('Fin de la période d’utilisation', 'datetime', (s, env) => subTimes(s.id, env.idx).useEnd),
      location: R('Lieu de la prestation', 'contact', (s, env) => env.idx.contact[env.idx.project[s.projectId]?.venueId]),
    },
  },
  contact: { label: 'Contact', custom: 'contact', fields: contactFields },
  person: {
    label: 'Personne de contact',
    fields: {
      name: F('Nom complet', 'text', (p) => personName(p)),
      firstname: F('Prénom', 'text', (p) => p.firstName),
      lastname: F('Nom', 'text', (p) => p.lastName),
      email: F('E-mail', 'text', (p) => p.email),
      phone: F('Téléphone', 'text', (p) => p.phone),
      function: F('Fonction', 'text', (p) => p.role),
    },
  },
  user: {
    label: 'Utilisateur connecté',
    fields: {
      name: F('Nom', 'text', (u) => u.name),
      email: F('E-mail', 'text', (u) => u.email),
      role: F('Rôle', 'text', (u) => u.role),
    },
  },
  page: {
    label: 'Page',
    fields: {
      number: F('Numéro de page', 'number', (p) => p.number),
      total: F('Nombre de pages', 'number', (p) => p.total),
    },
  },

  // ---------- Lignes des modules (colonnes) ----------
  line: {
    label: 'Équipement planifié',
    fields: {
      checkbox: F('Case à cocher', 'html', () => '<span class="dt-box"></span>'),
      quantity: F('Quantité totale', 'number', (l) => l.qty),
      name: F('Nom', 'text', (l) => l.name),
      code: F('Code', 'text', (l) => l.code),
      location: F('Emplacement dans l’entrepôt', 'text', (l, env) => l.location ?? env.idx.eq[l.equipmentId]?.location ?? ''),
      unit_price: F('Prix unitaire', 'price', (l) => l.unitPrice),
      factor: F('Coef.', 'number', (l) => l.factor),
      discount: F('Remise', 'pct', (l) => l.discount),
      price: F('Prix', 'price', (l) => l.total),
      category: F('Catégorie', 'text', (l) => l.category),
      group: F('Groupe', 'text', (l) => l.group),
      remark: F('Remarque', 'text', (l) => l.remark),
      weight: F('Poids unitaire (kg)', 'number', (l) => l.weight),
      total_weight: F('Poids total (kg)', 'number', (l) => (Number(l.weight) || 0) * (Number(l.qty) || 0)),
      power: F('Puissance (W)', 'number', (l) => l.power),
      serials: F('Numéros de série', 'text', (l) => (l.serials || []).join(', ')),
      ready: F('Prêts', 'number', (l) => l.ready),
      on_site: F('Sur site', 'number', (l) => l.onSite),
      to_prepare: F('À préparer', 'number', (l) => l.toPrepare),
      optional: F('Optionnel', 'bool', (l) => l.optional),
      kind: F('Location / vente', 'text', (l) => (l.kind === 'vente' ? 'Vente' : 'Location')),
      image: F('Image', 'html', (l) => (l.image ? `<img src="${escapeHtml(l.image)}" alt="" style="max-height: 38px; max-width: 60px">` : '')),
      equipment: R('Équipement', 'equipment', (l, env) => env.idx.eq[l.equipmentId]),
    },
  },
  equipment: {
    label: 'Équipement',
    custom: 'equipement',
    fields: {
      name: F('Nom', 'text', (e) => e.name),
      code: F('Code', 'text', (e) => e.code),
      category: F('Catégorie', 'text', (e, env) => env.idx.cat[e.categoryId]?.name),
      rental_price: F('Prix de location', 'price', (e) => e.rentalPrice),
      purchase_price: F('Prix d’achat - extra', 'price', (e) => e.purchasePrice),
      subrental_cost: F('Coût de sous-location', 'price', (e) => e.subrentalCost),
      weight: F('Poids (kg)', 'number', (e) => e.weight),
      volume: F('Volume (m³)', 'number', (e) => e.volume),
      power: F('Puissance (W)', 'number', (e) => e.power),
      location: F('Emplacement dans l’entrepôt', 'text', (e) => e.location),
      external_remark: F('Remarque externe', 'text', (e) => e.externalRemark),
      internal_remark: F('Remarque interne', 'text', (e) => e.internalRemark),
      stock: F('Stock', 'number', (e) => e.stock),
    },
  },
  group: {
    label: 'Groupe d’équipement',
    fields: {
      name: F('Nom', 'text', (g) => g.name),
      start: F('Début', 'datetime', (g) => g.start),
      end: F('Fin', 'datetime', (g) => g.end),
      count: F('Nombre d’articles', 'number', (g) => g.lines.filter((l) => !l.depth).length),
      price: F('Prix', 'price', (g) => g.lines.reduce((s, l) => s + (l.depth ? 0 : Number(l.total) || 0), 0)),
      remark: F('Remarque', 'text', (g) => g.remark),
    },
  },
  fn: {
    label: 'Fonction',
    fields: {
      quantity: F('Quantité', 'number', (f) => f.qty),
      name: F('Nom', 'text', (f) => f.name),
      kind: F('Type', 'text', (f) => (f.kind === 'transport' ? 'Transport' : 'Équipe')),
      group: F('Groupe de fonctions', 'text', (f) => f.group),
      start: F('Depuis', 'datetime', (f) => f.start),
      end: F('À', 'datetime', (f) => f.end),
      unit_price: F('Tarif', 'price', (f) => f.unitPrice),
      unit: F('Unité', 'text', (f) => f.unitLabel),
      billed_qty: F('Quantité facturée', 'number', (f) => f.billedQty),
      price: F('Prix', 'price', (f) => f.total),
      assigned: F('Personnes affectées', 'text', (f) => (f.assigned || []).map((a) => a.name).join(', ')),
      remark: F('Remarque', 'text', (f) => f.remark),
    },
  },
  asg: {
    label: 'Affectation',
    fields: {
      name: F('Nom', 'text', (a) => a.name),
      function: F('Fonction', 'text', (a) => a.function),
      start: F('Depuis', 'datetime', (a) => a.start),
      end: F('À', 'datetime', (a) => a.end),
      phone: F('Téléphone', 'text', (a) => a.phone),
      email: F('E-mail', 'text', (a) => a.email),
      vehicle: F('Véhicule', 'text', (a) => a.vehicle),
      plate: F('Immatriculation', 'text', (a) => a.plate),
    },
  },
  cost: {
    label: 'Coût supplémentaire',
    fields: {
      name: F('Nom', 'text', (c) => c.name),
      quantity: F('Quantité', 'number', (c) => c.qty),
      unit_price: F('Prix unitaire', 'price', (c) => c.unitPrice),
      discount: F('Remise', 'pct', (c) => c.discount),
      price: F('Prix', 'price', (c) => c.total),
      remark: F('Remarque', 'text', (c) => c.remark),
    },
  },
  period: {
    label: 'Période',
    fields: {
      name: F('Nom', 'text', (p) => p.name),
      start: F('Début', 'datetime', (p) => p.start),
      end: F('Fin', 'datetime', (p) => p.end),
      days: F('Nombre de jours', 'number', (p) => (p.start ? daysSpan(p.start, p.end) : null)),
    },
  },
  task: {
    label: 'Tâche',
    fields: {
      title: F('Titre', 'text', (t) => t.title),
      status: F('Statut', 'text', (t) => TASK_LABELS[t.status] || t.status),
      deadline: F('Échéance', 'datetime', (t) => t.deadline),
      assignees: F('Assignée à', 'text', (t) => (t.assignees || []).join(', ')),
      details: F('Détails', 'text', (t) => t.details),
    },
  },
  payment: {
    label: 'Paiement',
    fields: {
      date: F('Date', 'date', (p) => p.date),
      method: F('Mode de paiement', 'text', (p) => p.method),
      amount: F('Montant', 'price', (p) => p.amount),
    },
  },
}

/** Champs d'un nœud, y compris les champs de saisie supplémentaires (Configuration › Champs). */
export function fieldsOf(node, settings) {
  const def = SCHEMA[node]
  if (!def) return {}
  if (!def.custom) return def.fields
  const extra = Object.fromEntries(
    (settings?.customFields || [])
      .filter((c) => c.entity === def.custom)
      .map((c) => [c.id, F(c.label, CF_TYPES[c.type] || 'text', (o) => o.customFields?.[c.id])]),
  )
  return { ...def.fields, ...extra }
}

/** Valeur (typée) d'un chemin relatif à un nœud : resolveIn('line', ligne, ['equipment', 'code'], env). */
export function resolveIn(node, src, keys, env) {
  let cur = src
  let at = node
  for (const k of keys) {
    if (cur == null) return undefined
    const f = fieldsOf(at, env.settings)[k]
    if (!f) return undefined
    if (f.ref) {
      cur = f.get(cur, env)
      at = f.ref
      continue
    }
    return typed(f.type, f.get(cur, env))
  }
  return undefined
}

export const ROOTS = {
  company: { node: 'company', src: (env) => env.settings },
  f: { node: 'doc', src: (env) => env.doc },
  p: { node: 'project', src: (env) => env.idx.project[env.doc?.projectId] },
  sp: { node: 'subproject', src: (env) => env.sub || env.idx.sub[env.doc?.subprojectIds?.[0]] },
  user: { node: 'user', src: (env) => env.user },
  page: { node: 'page', src: (env) => env.page },
}

const resolveRoot = (path, env) => {
  const [root, ...rest] = path.split('.')
  const r = ROOTS[root]
  return r ? resolveIn(r.node, r.src(env), rest, env) : undefined
}
const bindEnv = (env) => {
  env.resolve = (path) => resolveRoot(path, env)
  return env
}
/** Copie du contexte (sous-projet courant, page…), les variables assignées restent partagées. */
export const withEnv = (env, patch) => bindEnv({ ...env, ...patch })

/** Contexte d'évaluation d'un document. */
export function makeEnv({ doc, idx, user, sub = null, page = null, template = null, subject = '' }) {
  const settings = idx.settings
  return bindEnv({
    idx,
    settings,
    doc,
    sub,
    page,
    subject,
    depth: 0,
    language: template?.language || 'fr',
    user: user || { name: settings.userName, email: '', role: '' },
    vars: {},
    fmt: fmtOptions({ country: template?.country || settings.country, currency: settings.currency, language: template?.language }),
  })
}

/** Racines du sélecteur de variables (« Début ») selon le contexte. */
export function pickerRoots({ docType = 'devis', row = null, page = false } = {}) {
  if (row) return [{ prefix: '', node: row, label: SCHEMA[row].label }]
  return [
    { prefix: 'company', node: 'company', label: SCHEMA.company.label },
    { prefix: 'f', node: 'doc', label: DOC_TYPES[docType]?.label || 'Document' },
    { prefix: 'sp', node: 'subproject', label: 'Sous-projet' },
    { prefix: 'user', node: 'user', label: SCHEMA.user.label },
    ...(page ? [{ prefix: 'page', node: 'page', label: 'Page' }] : []),
  ]
}

/** Entrées visibles d'un nœud : feuilles (à ajouter) et liens (» pour descendre). */
export const pickerEntries = (node, settings) =>
  Object.entries(fieldsOf(node, settings))
    .filter(([, f]) => !f.hidden)
    .map(([key, f]) => ({ key, label: f.label, ref: f.ref || null, type: f.type || null }))

/** Recherche jusqu'à deux niveaux sous le nœud courant (comme Rentman). */
export function pickerSearch(node, q, settings, depth = 2, trail = []) {
  const s = q.trim().toLowerCase()
  if (s.length < 3) return []
  const out = []
  for (const e of pickerEntries(node, settings)) {
    const path = [...trail, e]
    if (!e.ref && e.label.toLowerCase().includes(s)) out.push(path)
    if (e.ref && depth > 1) out.push(...pickerSearch(e.ref, q, settings, depth - 1, path))
  }
  return out
}
