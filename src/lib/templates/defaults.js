// Catalogue des modèles de documents : blocs, modules, modèles système (Compact / Étendu),
// en-têtes de documents et modèles de texte par défaut.
import { DOC_TYPES } from '../model'
import { uid } from '../utils'

// ---------- Mise en page et contenu ----------
export const LAYOUT_BLOCKS = [
  { kind: 'section', cols: 2, label: 'Section 2-colonnes' },
  { kind: 'section', cols: 3, label: 'Section 3-colonnes' },
  { kind: 'section', cols: 4, label: 'Section 4-colonnes' },
  { kind: 'section', cols: 6, label: 'Section 6-colonnes' },
]
export const CONTENT_BLOCKS = [
  { kind: 'text', label: 'Texte', icon: 'title' },
  { kind: 'image', label: 'Images', icon: 'add_photo_alternate' },
  { kind: 'pagebreak', label: 'Saut de page', icon: 'wallpaper' },
  { kind: 'hr', label: 'Ligne horizontale', icon: 'web_asset' },
]

const col = (path, header, width, align = 'left', extra = {}) => ({ path, header, width, align, marginLeft: 0, marginRight: 0, css: '', hideZero: null, ...extra })

// ---------- Modules ----------
// row : nœud du schéma des variables d'une ligne (colonnes) ; types : documents où le module est proposé
export const MODULES = {
  equipment: {
    label: 'Équipements', icon: 'category', row: 'line',
    options: { title: 'Équipement', groupBy: 'groupes', showGroupTitle: true, showSubtotals: true, showContents: true, showAccessories: true, optional: 'sans', kind: 'tous', warehouse: 'tous', showGroupPeriod: false, showGroupRemark: true, showLineRemark: false, hideZeroLines: false, subprojectTitle: 'auto' },
    columns: () => [col('quantity', '', 6), col('name', '', 50), col('unit_price', 'Prix unitaire', 15, 'right'), col('factor', 'Coef.', 9, 'right'), col('price', 'Prix', 20, 'right')],
  },
  equipmentGroups: {
    label: 'Groupes équipement', icon: 'workspaces', row: 'group',
    options: { title: 'Groupes d’équipement', showTotal: true },
    columns: () => [col('name', '', 46), col('start', 'Début', 18), col('end', 'Fin', 18), col('price', 'Prix', 18, 'right')],
  },
  functionGroups: {
    label: 'Groupe de fonctions', icon: 'supervisor_account', row: 'fn',
    options: { title: 'Ressources humaines', include: 'tous', showGroupTitle: true, showSubtotals: true, showAssigned: false, hideZeroLines: false },
    columns: () => [col('quantity', '', 6), col('name', '', 44), col('start', 'Depuis', 16), col('end', 'À', 16), col('price', 'Prix', 18, 'right')],
  },
  crewFunctions: {
    label: 'Fonctions équipe', icon: 'person', row: 'fn',
    options: { title: 'Équipe', showAssigned: false, showTotal: true, hideZeroLines: false },
    columns: () => [col('quantity', '', 6), col('name', '', 44), col('start', 'Depuis', 16), col('end', 'À', 16), col('price', 'Prix', 18, 'right')],
  },
  transportFunctions: {
    label: 'Fonctions transport', icon: 'person_pin_circle', row: 'fn',
    options: { title: 'Transport', showAssigned: false, showTotal: true, hideZeroLines: false },
    columns: () => [col('quantity', '', 6), col('name', '', 44), col('start', 'Depuis', 16), col('end', 'À', 16), col('price', 'Prix', 18, 'right')],
  },
  crewPlanning: {
    label: 'Planification équipe', icon: 'assignment_ind', row: 'asg',
    options: { title: 'Planification de l’équipe' },
    columns: () => [col('name', 'Personnel', 26), col('function', 'Fonction', 26), col('start', 'Depuis', 17), col('end', 'À', 17), col('phone', 'Téléphone', 14)],
  },
  vehiclePlanning: {
    label: 'Planification véhicule', icon: 'local_shipping', row: 'asg',
    options: { title: 'Planification des véhicules' },
    columns: () => [col('vehicle', 'Véhicule', 28), col('plate', 'Immatriculation', 16), col('function', 'Fonction', 22), col('start', 'Depuis', 17), col('end', 'À', 17)],
  },
  costs: {
    label: 'Coûts supplémentaires', icon: 'playlist_add', row: 'cost',
    options: { title: 'Coûts supplémentaires', showTotal: true, hideZeroLines: false },
    columns: () => [col('quantity', '', 6), col('name', '', 64), col('price', 'Prix', 30, 'right')],
  },
  planning: {
    label: 'Planning', icon: 'schedule', row: 'period',
    options: { title: 'Planning', onlyExternal: false, headerStyle: 'titre' },
    columns: () => [col('name', '', 40), col('start', 'Début', 30), col('end', 'Fin', 30)],
  },
  tasks: {
    label: 'Tâches', icon: 'assignment_turned_in', row: 'task',
    options: { title: 'Tâches', hideDone: false },
    columns: () => [col('title', 'Tâche', 40), col('status', 'Statut', 14), col('deadline', 'Échéance', 20), col('assignees', 'Assignée à', 26)],
  },
  notes: {
    label: 'Notes', icon: 'note', options: { title: 'Notes', scope: 'externe', showAuthor: false, projectRemark: true },
  },
  totals: {
    label: 'Somme', icon: 'playlist_add_check', types: ['devis', 'contrat', 'facture', 'avoir', 'autre', 'commande'],
    options: {
      title: 'Total', showCategories: true, categories: ['location', 'vente', 'personnel', 'transport', 'autres'], emptyCategories: 'masquer',
      showGroupDiscount: false, groupDiscountFrom: 'article', groupDiscountTo: 'projet', groupDiscountFormat: 'pourcentage',
      showTotalDiscount: true, totalDiscountTo: 'projet', totalDiscountFormat: 'montant',
      showInsurance: true, showVat: true, showDeposit: false, showPayments: false, extendNegative: false, labelAlign: 'gauche',
    },
  },
  signature: {
    label: 'Signature numérique', icon: 'gesture', types: ['devis', 'contrat', 'livraison', 'preparation', 'autre'],
    options: { title: 'Confirmation de l’offre {$f.number}', mode: 'numerique', width: 60, align: 'left' },
  },
  conditions: {
    label: 'Conditions supplémentaires', icon: 'assignment', options: { title: 'Conditions supplémentaires', document: true, subprojects: true },
  },
  insurance: {
    label: 'Assurance', icon: 'verified_user', types: ['devis', 'contrat', 'facture', 'avoir', 'autre'], options: { title: 'Assurance', text: 'Le matériel loué est assuré par nos soins pendant toute la durée de la location.', showAmount: true },
  },
  documentText: { label: 'Texte du document', icon: 'subject', options: {} },
  payments: {
    label: 'Paiements', icon: 'payments', row: 'payment', types: ['facture', 'avoir'],
    options: { title: 'Paiements reçus', showBalance: true },
    columns: () => [col('date', 'Date', 30), col('method', 'Mode de paiement', 40), col('amount', 'Montant', 30, 'right')],
  },
  bankDetails: {
    label: 'Coordonnées bancaires', icon: 'account_balance', types: ['facture', 'avoir', 'devis', 'contrat', 'autre'],
    options: { title: 'Règlement', showMethods: true, showReference: true },
  },
  paymentQr: {
    label: 'QR de paiement', icon: 'qr_code_2', types: ['facture'],
    options: { size: 3.2, caption: 'Scannez ce code avec votre application bancaire pour payer par virement.', align: 'left' },
  },
}
// Étiquettes de matériel (un numéro de série ou un équipement par étiquette)
MODULES.qrCode = {
  label: 'QR code', icon: 'qr_code_2', types: ['etiquette'],
  options: { content: 'numero', size: 2.4, align: 'left', caption: '' },
}
MODULES.equipmentDetails = {
  label: 'Fiche équipement', icon: 'inventory_2', types: ['etiquette'],
  options: { fields: ['name', 'serial', 'code', 'location'], showLabels: true, nameSize: 10 },
}
MODULES.equipmentImage = {
  label: 'Photo de l’équipement', icon: 'image', types: ['etiquette'],
  options: { height: 1.8, align: 'left' },
}
export const LABEL_FIELDS = [
  ['name', 'Nom de l’équipement'], ['serial', 'Numéro de série'], ['code', 'Code'], ['internalRef', 'Référence interne'], ['category', 'Catégorie'],
  ['location', 'Emplacement dans l’entrepôt'], ['stockLocation', 'Emplacement de stock'], ['purchaseDate', 'Date d’achat'], ['weight', 'Poids'],
  ['power', 'Puissance'], ['company', 'Propriétaire (entreprise)'], ['phone', 'Téléphone de l’entreprise'],
]

export const MODULE_ORDER = Object.keys(MODULES)
export const modulesFor = (type) => MODULE_ORDER.filter((k) => !MODULES[k].types || MODULES[k].types.includes(type))

export const BLOCK_LABELS = { section: 'Section', subprojects: 'Sous-projets', text: 'Texte', image: 'Image', pagebreak: 'Saut de page', hr: 'Ligne horizontale' }
export const blockLabel = (b) => (b.type === 'module' ? MODULES[b.module]?.label || 'Module' : b.type === 'section' ? `Section ${b.cols}-colonnes` : BLOCK_LABELS[b.type] || b.type)

export const BASE_STYLE = { marginTop: 1, marginBottom: 1, marginLeft: 0, marginRight: 0 }
export const MODULE_STYLE = { fontSize: null, color: null, background: null, headerStyle: null, headerBg: null, groupBold: true, groupColor: null, contentsItalic: false, contentsColor: null, stripes: false, rowLines: false, className: '', css: '', conditional: [] }

/** Nouveau bloc (éditeur ou modèles système). */
export function newBlock(kind, extra = {}, id = uid('b_')) {
  const base = { id, style: { ...BASE_STYLE } }
  if (kind === 'section') {
    const cols = extra.cols || 2
    return { ...base, type: 'section', cols, widths: Array.from({ length: cols }, () => Math.round(1000 / cols) / 10), gap: 16, valign: 'top', columns: Array.from({ length: cols }, () => []), ...extra }
  }
  if (kind === 'subprojects') return { ...base, type: 'subprojects', options: { showTitle: true, title: '{$sp.name}', pageBreak: false }, children: [], ...extra }
  if (kind === 'text') return { ...base, type: 'text', html: '<p>Saisissez votre texte…</p>', ...extra }
  if (kind === 'image') return { ...base, type: 'image', src: '', width: 35, align: 'left', ...extra }
  if (kind === 'pagebreak') return { ...base, type: 'pagebreak', ...extra }
  if (kind === 'hr') return { ...base, type: 'hr', options: { thickness: 1, color: '#1d1f23', lineStyle: 'solid' }, ...extra }
  const m = MODULES[kind]
  return {
    ...base,
    type: 'module',
    module: kind,
    options: { ...m.options, ...(extra.options || {}) },
    columns: extra.columns || (m.columns ? m.columns().map((c, i) => ({ id: `${id}-c${i}`, ...c })) : undefined),
    style: { ...BASE_STYLE, ...MODULE_STYLE, ...(extra.style || {}) },
  }
}

// ---------- Style du document ----------
export const DOC_FONTS = ['Mulish', 'Source Sans 3', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Raleway', 'Merriweather', 'Playfair Display', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New']
const GOOGLE_FONTS = new Set(['Mulish', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Raleway', 'Merriweather', 'Playfair Display'])
/** Charge une police Google à la demande (Styles › Police). */
export function loadDocFont(font) {
  if (!GOOGLE_FONTS.has(font) || typeof document === 'undefined') return
  const id = `gf-${font.replace(/\s+/g, '-')}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, '+')}:ital,wght@0,400;0,600;0,700;1,400&display=swap`
  document.head.appendChild(link)
}

export const DEFAULT_STYLE = {
  font: 'Mulish', size: 9, lineHeight: 1.35, color: '#1d1f23', headingFont: '', headingColor: '#1d1f23', h1Size: 19, h2Size: 13,
  accent: '#1f87e5', tableHeader: 'encadre', headerBg: '#eef3f9', lineColor: '#1d1f23', css: '',
}
export const DEFAULT_SIGNATURE = { buttonText: 'Cliquez ici pour signer et accepter l’offre', buttonColor: '#f28c4a', textColor: '#ffffff', size: 'normal', showSigned: true }

export const LANGUAGES = [['fr', 'Français'], ['en', 'English']]
export const COUNTRIES = ['France', 'Belgique', 'Luxembourg', 'Suisse', 'Canada', 'Monaco', 'Pays-Bas', 'Allemagne', 'Royaume-Uni', 'États-Unis', 'Espagne', 'Italie']

// ---------- Modèles système ----------
const recipient = `<p><strong>{$f.customer.displayname}</strong><br>{iff $f.contact.name}à l’att. de {$f.contact.name}<br>{/iff}{$f.customer.address}<br>{$f.customer.zip} {$f.customer.city}<br>{$f.customer.country}</p>`

function titleBlock(type) {
  const lines = {
    devis: 'Date : {$f.date}<br>Valable jusqu’au : {$f.expiry}',
    contrat: 'Date : {$f.date}<br>Valable jusqu’au : {$f.expiry}',
    facture: 'Date : {$f.date}<br>Échéance : {$f.duedate}',
    avoir: 'Date : {$f.date}',
  }[type]
  return `<h1 style="text-align: right">{$f.type}</h1><p style="text-align: right"><strong>N° {$f.number}</strong>{iff $f.version > 1} (version {$f.version}){/iff}<br>${lines}</p>`
}

function detailsBlock(type) {
  const rows = {
    devis: [['N° de projet', '{$f.project.number}'], ['Lieu de la prestation', '{$f.project.location.displayname}<br>{$f.project.location.address}<br>{$f.project.location.zip} {$f.project.location.city}'], ['N° d’offre', '{$f.number}'], ['Date de l’offre', '{$f.date}'], ['Valable jusqu’au', '{$f.expiry}'], ['Paiement', '{$f.payment_term}'], ['Créé par', '{$f.project.accountmanager}']],
    contrat: [['N° de projet', '{$f.project.number}'], ['Lieu de la prestation', '{$f.project.location.displayname}<br>{$f.project.location.address}<br>{$f.project.location.zip} {$f.project.location.city}'], ['N° de contrat', '{$f.number}'], ['Date du contrat', '{$f.date}'], ['Période d’utilisation', '{$f.project.usageperiod_start} – {$f.project.usageperiod_end}'], ['Créé par', '{$f.project.accountmanager}']],
    facture: [['N° de projet', '{$f.project.number}'], ['Votre référence', '{$f.project.reference}'], ['N° de facture', '{$f.number}'], ['Date de facture', '{$f.date}'], ['Échéance', '{$f.duedate}'], ['Paiement', '{$f.payment_term}'], ['N° TVA client', '{$f.customer.vat}']],
    avoir: [['N° de projet', '{$f.project.number}'], ['N° de note de crédit', '{$f.number}'], ['Date', '{$f.date}'], ['Facture d’origine', '{$f.quote}'], ['N° TVA client', '{$f.customer.vat}']],
  }[type]
  return `<h2>{$f.subject}</h2><table class="kv"><tbody>${rows.map(([k, v]) => `<tr><td>${k} :</td><td>${v}</td></tr>`).join('')}</tbody></table>`
}

const SUBJECTS = {
  devis: 'Référence : {$f.project.name}',
  contrat: 'Contrat de location : {$f.project.name}',
  facture: 'Facture {$f.number} : {$f.project.name}',
  avoir: 'Note de crédit {$f.number} : {$f.project.name}',
}
const FILE_NAMES = '{$f.type} {$f.number}{if $f.version > 1} v{$f.version}{/if}'

function systemTemplate(type, variant) {
  const id = `sys_${variant}_${type}`
  let n = 0
  const b = (kind, extra) => newBlock(kind, extra, `${id}-${++n}`)
  const extended = variant === 'etendu'
  const quote = type === 'devis' || type === 'contrat'
  const blocks = [
    b('section', { cols: 2, widths: [58, 42], columns: [[b('text', { html: recipient })], [b('text', { html: titleBlock(type) })]] }),
    b('text', { html: detailsBlock(type), style: { ...BASE_STYLE, marginTop: 18 } }),
    b('documentText', { style: { ...BASE_STYLE, marginTop: 12 } }),
  ]
  if (extended) blocks.push(b('planning', { style: { ...BASE_STYLE, marginTop: 12 } }))
  blocks.push(
    b('equipment', {
      style: { ...BASE_STYLE, marginTop: 14 },
      ...(extended
        ? {
            options: { showGroupPeriod: true },
            columns: [col('quantity', '', 6), col('name', 'Équipement', 42), col('unit_price', 'Prix unitaire', 14, 'right'), col('factor', 'Coef.', 8, 'right'), col('discount', 'Remise', 10, 'right', { hideZero: true }), col('price', 'Prix', 20, 'right')].map((c, i) => ({ id: `${id}-eq-c${i}`, ...c })),
          }
        : { options: { showContents: false, showAccessories: false }, columns: [col('quantity', '', 6), col('name', 'Équipement', 70), col('price', 'Prix', 24, 'right')].map((c, i) => ({ id: `${id}-eq-c${i}`, ...c })) }),
    }),
    b('functionGroups', {
      style: { ...BASE_STYLE, marginTop: 14 },
      ...(extended ? {} : { options: { showGroupTitle: false, showSubtotals: false }, columns: [col('quantity', '', 6), col('name', 'Ressources humaines', 70), col('price', 'Prix', 24, 'right')].map((c, i) => ({ id: `${id}-fg-c${i}`, ...c })) }),
    }),
    b('costs', { style: { ...BASE_STYLE, marginTop: 14 } }),
    b('totals', { style: { ...BASE_STYLE, marginTop: 16 }, options: { showGroupDiscount: extended, showPayments: !quote } }),
  )
  if (!quote) blocks.push(b('bankDetails', { style: { ...BASE_STYLE, marginTop: 16 } }))
  if (!quote && extended && type === 'facture') blocks.push(b('paymentQr', { style: { ...BASE_STYLE, marginTop: 8 } }))
  blocks.push(b('conditions', { style: { ...BASE_STYLE, marginTop: 16 } }))
  if (quote) blocks.push(b('signature', { style: { ...BASE_STYLE, marginTop: 18 }, options: { title: type === 'contrat' ? 'Signature du contrat {$f.number}' : 'Confirmation de l’offre {$f.number}' } }))
  return {
    id,
    system: true,
    name: extended ? 'Étendu' : 'Compact',
    type,
    hidden: false,
    language: 'fr',
    country: 'France',
    subject: SUBJECTS[type],
    fileName: FILE_NAMES,
    thinLines: true,
    signature: { ...DEFAULT_SIGNATURE },
    headerText: '',
    footerText: '',
    style: { ...DEFAULT_STYLE },
    blocks,
  }
}

// ---------- Documents non financiers (logistique, équipe, document libre) ----------
const kv = (rows) => `<table class="kv"><tbody>${rows.map(([k, v]) => `<tr><td>${k} :</td><td>${v}</td></tr>`).join('')}</tbody></table>`
const venue = '{$f.project.location.displayname}<br>{$f.project.location.address}<br>{$f.project.location.zip} {$f.project.location.city}'
const signLine = (label) => `<p><strong>${label}</strong></p><p>Nom :</p><p>Date :</p><p>Signature :</p>`

function otherTemplate(type) {
  const id = `sys_standard_${type}`
  let n = 0
  const b = (kind, extra) => newBlock(kind, extra, `${id}-${++n}`)
  const cols = (list) => list.map(([path, header, width, align, extra], i) => ({ id: `${id}-c${i}`, ...col(path, header, width, align || 'left', extra) }))
  const m = (top) => ({ ...BASE_STYLE, marginTop: top })
  let blocks
  if (type === 'preparation') {
    blocks = [
      b('section', { cols: 2, widths: [55, 45], columns: [
        [b('text', { html: '<h1>Bon de préparation</h1><p><strong>N° {$f.number}</strong><br>Projet {$f.project.number} — {$f.project.name}</p>' })],
        [b('text', { html: kv([['Client', '{$f.customer.displayname}'], ['Lieu', venue], ['Départ', '{$f.project.planperiod_start}'], ['Retour', '{$f.project.planperiod_end}'], ['Gestionnaire', '{$f.project.accountmanager}']]) })],
      ] }),
      b('planning', { style: m(14) }),
      b('equipment', { style: m(14), options: { showSubtotals: false, showGroupPeriod: true, showLineRemark: true }, columns: cols([['checkbox', '', 5, 'center'], ['quantity', 'Qté', 7], ['name', 'Équipement', 44], ['code', 'Code', 14], ['location', 'Emplacement', 16], ['total_weight', 'Poids (kg)', 14, 'right', { hideZero: true }]]) }),
      b('notes', { style: m(14), options: { title: 'Notes pour l’entrepôt', scope: 'entrepot', projectRemark: false } }),
      b('section', { cols: 2, style: m(24), columns: [[b('text', { html: signLine('Préparé par') })], [b('text', { html: signLine('Vérifié par') })]] }),
    ]
  } else if (type === 'livraison') {
    blocks = [
      b('section', { cols: 2, widths: [58, 42], columns: [[b('text', { html: recipient })], [b('text', { html: '<h1 style="text-align: right">Bon de livraison</h1><p style="text-align: right"><strong>N° {$f.number}</strong><br>Date : {$f.date}</p>' })]] }),
      b('text', { style: m(18), html: `<h2>{$f.subject}</h2>${kv([['N° de projet', '{$f.project.number}'], ['Votre référence', '{$f.project.reference}'], ['Lieu de livraison', venue], ['Livraison', '{$f.project.usageperiod_start}'], ['Retour prévu', '{$f.project.planperiod_end}'], ['Contact sur place', '{$f.contact.name} {$f.contact.phone}']])}` }),
      b('documentText', { style: m(12) }),
      b('equipment', { style: m(14), options: { showSubtotals: false }, columns: cols([['quantity', 'Qté', 8], ['name', 'Équipement', 52], ['code', 'Code', 16], ['serials', 'N° de série', 24]]) }),
      b('text', { style: m(16), html: '<p>Le matériel ci-dessus a été remis en bon état de fonctionnement. Toute réserve doit être indiquée lors de la réception.</p>' }),
      b('section', { cols: 2, style: m(18), columns: [[b('text', { html: signLine('Remis par') })], [b('signature', { options: { title: 'Réception du matériel', mode: 'manuscrite', width: 100 } })]] }),
    ]
  } else if (type === 'feuille_route') {
    blocks = [
      b('text', { html: '<h1>Feuille de route</h1><p><strong>{$f.project.name}</strong> — projet {$f.project.number}</p>' }),
      b('section', { cols: 2, style: m(12), columns: [
        [b('text', { html: kv([['Lieu', venue], ['Client', '{$f.customer.displayname}'], ['Contact client', '{$f.contact.name}<br>{$f.contact.phone}']]) })],
        [b('text', { html: kv([['Gestionnaire', '{$f.project.accountmanager}'], ['Montage', '{$f.project.planperiod_start}'], ['Événement', '{$f.project.usageperiod_start} – {$f.project.usageperiod_end}'], ['Démontage', '{$f.project.planperiod_end}']]) })],
      ] }),
      b('documentText', { style: m(12) }),
      b('planning', { style: m(14) }),
      b('crewPlanning', { style: m(14) }),
      b('vehiclePlanning', { style: m(14) }),
      b('tasks', { style: m(14), options: { hideDone: true } }),
      b('notes', { style: m(14), options: { title: 'Notes', scope: 'toutes', projectRemark: true } }),
    ]
  } else if (type === 'etiquette') {
    blocks = [
      b('section', { cols: 2, widths: [36, 64], columns: [
        [b('qrCode', { options: { content: 'numero', size: 2.6, align: 'left', caption: '' } })],
        [b('equipmentDetails', { options: { fields: ['name', 'serial', 'code', 'location'], showLabels: true, nameSize: 9.5 } }), b('text', { style: m(2), html: '<p style="font-size: 6pt; opacity: 0.8">{$company.name}{iff $company.phone} · {$company.phone}{/iff}</p>' })],
      ] }),
    ]
  } else if (type === 'commande') {
    // Ligne masquée quand la variable est vide (bon sans sous-location, sans projet…)
    const row = (label, value, test = value) => `{iff ${test.replace(/[{}]/g, '')}}<tr><td>${label} :</td><td>${value}</td></tr>{/iff}`
    blocks = [
      b('section', { cols: 2, widths: [58, 42], columns: [
        [b('text', { html: '<p class="small">Fournisseur</p><p><strong>{$f.customer.displayname}</strong><br>{$f.customer.address}<br>{$f.customer.zip} {$f.customer.city}<br>{$f.customer.country}</p>' })],
        [b('text', { html: '<h1 style="text-align: right">Bon de commande</h1><p style="text-align: right"><strong>N° {$f.number}</strong><br>Date : {$f.date}</p>' })],
      ] }),
      b('text', { style: m(18), html: `<h2>{$f.subject}</h2><table class="kv"><tbody>${[
        row('Projet', '{$f.project.number} — {$f.project.name}', '$f.project.name'),
        row('Sous-location', '{$f.order.subrent}', '$f.order.subrent'),
        row('Période de location', '{$f.order.start} – {$f.order.end}', '$f.order.start'),
        row('Livraison / enlèvement', '{$f.order.delivery}', '$f.order.delivery'),
        row('N° TVA fournisseur', '{$f.customer.vat}', '$f.customer.vat'),
        row('Commandé par', '{$user.name}', '$user.name'),
      ].join('')}</tbody></table>` }),
      b('documentText', { style: m(12) }),
      b('costs', { style: m(14), options: { title: 'Commande', showTotal: false }, columns: cols([['quantity', 'Qté', 8], ['name', 'Désignation', 52], ['unit_price', 'Prix unitaire HT', 20, 'right'], ['price', 'Total HT', 20, 'right']]) }),
      b('totals', { style: m(12), options: { title: 'Total de la commande', showCategories: false, showInsurance: false, showTotalDiscount: false, showPayments: false, showVat: true } }),
      b('conditions', { style: m(16), options: { title: 'Conditions', document: true, subprojects: false } }),
      b('section', { cols: 2, style: m(24), columns: [[b('text', { html: signLine('Pour {$company.name}') })], [b('text', { html: signLine('Bon pour accord du fournisseur') })]] }),
    ]
  } else {
    blocks = [
      b('section', { cols: 2, widths: [58, 42], columns: [[b('text', { html: recipient })], [b('text', { html: '<h1 style="text-align: right">{$f.subject}</h1><p style="text-align: right"><strong>N° {$f.number}</strong><br>Date : {$f.date}</p>' })]] }),
      b('text', { style: m(18), html: kv([['Projet', '{$f.project.number} — {$f.project.name}'], ['Lieu', venue], ['Période', '{$f.project.usageperiod_start} – {$f.project.usageperiod_end}']]) }),
      b('documentText', { style: m(14) }),
      b('conditions', { style: m(16), options: { document: true, subprojects: false } }),
    ]
  }
  return {
    id, system: true, name: 'Standard', type, hidden: false, language: 'fr', country: 'France',
    subject: { etiquette: 'Étiquette {$f.equipment.name}{iff $f.serial.serial} — {$f.serial.serial}{/iff}', preparation: 'Bon de préparation {$f.project.number} — {$f.project.name}', livraison: 'Livraison : {$f.project.name}', feuille_route: 'Feuille de route : {$f.project.name}', autre: 'Document : {$f.project.name}', commande: 'Commande {$f.number}{iff $f.project.name} — {$f.project.name}{/iff}' }[type],
    fileName: type === 'etiquette' ? 'Étiquettes {$f.equipment.name}' : '{$f.type} {$f.number}', thinLines: true, signature: { ...DEFAULT_SIGNATURE }, headerText: '', footerText: '',
    // Étiquette : petit texte serré pour tenir sur quelques centimètres
    style: type === 'etiquette' ? { ...DEFAULT_STYLE, size: 7.5, h1Size: 11, h2Size: 9, lineHeight: 1.25 } : { ...DEFAULT_STYLE },
    blocks,
  }
}

/**
 * Devis / contrat à propositions : chaque proposition (A, B, C…) avec son détail et son total ; le client en choisit
 * une en signant.
 */
function proposalsTemplate(type) {
  const id = `sys_propositions_${type}`
  let n = 0
  const b = (kind, extra) => newBlock(kind, extra, `${id}-${++n}`)
  const m = (top) => ({ ...BASE_STYLE, marginTop: top })
  const cols = (prefix, list) => list.map(([path, header, width, align, extra], i) => ({ id: `${id}-${prefix}${i}`, ...col(path, header, width, align || 'left', extra) }))
  return {
    id, system: true, name: 'Propositions', type, hidden: false, language: 'fr', country: 'France',
    subject: type === 'contrat' ? 'Contrat de location : {$f.project.name}' : 'Propositions : {$f.project.name}',
    fileName: FILE_NAMES, thinLines: true, signature: { ...DEFAULT_SIGNATURE, buttonText: 'Choisir ma proposition et signer' }, headerText: '', footerText: '', style: { ...DEFAULT_STYLE },
    blocks: [
      b('section', { cols: 2, widths: [58, 42], columns: [[b('text', { html: recipient })], [b('text', { html: titleBlock(type) })]] }),
      b('text', { html: detailsBlock(type), style: m(18) }),
      b('documentText', { style: m(12) }),
      b('text', { style: m(12), html: '<p>{iff $f.proposals_count > 1}Nous vous présentons <strong>{$f.proposals_count} propositions</strong> : choisissez celle qui vous convient en signant ce document.{else}Voici le détail de notre proposition.{/iff}</p>' }),
      b('subprojects', {
        style: m(10),
        options: { showTitle: true, title: '{$sp.proposal_title}', pageBreak: false },
        children: [
          b('equipment', { style: m(8), options: { showContents: false, showAccessories: false, showSubtotals: false, subprojectTitle: 'non' }, columns: cols('eq', [['quantity', '', 6], ['name', 'Équipement', 70], ['price', 'Prix', 24, 'right']]) }),
          b('functionGroups', { style: m(8), options: { showGroupTitle: false, showSubtotals: false }, columns: cols('fg', [['quantity', '', 6], ['name', 'Ressources humaines', 70], ['price', 'Prix', 24, 'right']]) }),
          b('costs', { style: m(8) }),
          b('totals', { style: m(10), options: { title: 'Total de la proposition', showCategories: false, showGroupDiscount: false, showPayments: false } }),
        ],
      }),
      b('conditions', { style: m(16) }),
      b('signature', { style: m(18), options: { title: 'Choix et confirmation — {$f.number}' } }),
    ],
  }
}

export const SYSTEM_TEMPLATES = Object.keys(DOC_TYPES).flatMap((type) =>
  DOC_TYPES[type].finance ? [systemTemplate(type, 'compact'), systemTemplate(type, 'etendu'), ...(type === 'devis' || type === 'contrat' ? [proposalsTemplate(type)] : [])] : [otherTemplate(type)],
)

/** Modèle vierge (« Ajouter un modèle »), éventuellement copié d'un autre. */
export function blankTemplate(type, name = 'Nouveau modèle') {
  return {
    id: uid('tpl_'), system: false, name, type, hidden: false, language: 'fr', country: 'France', subject: SUBJECTS[type] || '{$f.type} : {$f.project.name}', fileName: FILE_NAMES, thinLines: true,
    signature: { ...DEFAULT_SIGNATURE }, headerText: '', footerText: '', style: { ...DEFAULT_STYLE },
    blocks: DOC_TYPES[type]?.finance
      ? [newBlock('section', { cols: 2, widths: [58, 42], columns: [[newBlock('text', { html: recipient })], [newBlock('text', { html: titleBlock(type) })]] }), newBlock('documentText'), newBlock('equipment'), newBlock('totals')]
      : [newBlock('section', { cols: 2, widths: [58, 42], columns: [[newBlock('text', { html: recipient })], [newBlock('text', { html: '<h1 style="text-align: right">{$f.type}</h1><p style="text-align: right"><strong>N° {$f.number}</strong><br>Date : {$f.date}</p>' })]] }), newBlock('documentText'), newBlock('equipment', { columns: [col('quantity', 'Qté', 8), col('name', 'Équipement', 62), col('code', 'Code', 30)].map((c, i) => ({ id: `c${i}-${uid('')}`, ...c })) })],
  }
}

/** Copie profonde avec de nouveaux identifiants de blocs et de colonnes. */
export function cloneTemplate(tpl, patch = {}) {
  const fresh = (blocks) =>
    blocks.map((b) => {
      const id = uid('b_')
      return {
        ...structuredClone(b),
        id,
        ...(b.columns && b.type === 'section' ? { columns: b.columns.map(fresh) } : {}),
        ...(b.columns && b.type === 'module' ? { columns: b.columns.map((c, i) => ({ ...c, id: `${id}-c${i}` })) } : {}),
        ...(b.children ? { children: fresh(b.children) } : {}),
      }
    })
  return { ...structuredClone(tpl), id: uid('tpl_'), system: false, hidden: false, blocks: fresh(tpl.blocks), ...patch }
}

// ---------- En-têtes de documents (papier à en-tête) ----------
// Étiquettes : formats courants des imprimantes d'étiquettes (Dymo, Brother QL, Zebra)
export const LABEL_SIZES = [[89, 36], [62, 29], [101, 54], [100, 50], [54, 25], [50, 25]]
export const PAGE_SIZES = {
  A4: [21, 29.7], A3: [29.7, 42], A5: [14.8, 21], 'A4 paysage': [29.7, 21], Letter: [21.59, 27.94], Legal: [21.59, 35.56],
  ...Object.fromEntries(LABEL_SIZES.map(([w, h]) => [`Étiquette ${w} × ${h} mm`, [w / 10, h / 10]])),
}
export const VISIBILITY = [
  ['factures', 'Afficher dans les factures'],
  ['devis', 'Afficher dans les devis'],
  ['contrats', 'Afficher dans les contrats'],
  ['souslocation', 'Afficher dans les bons de sous-location'],
  ['rappels', 'Afficher dans les rappels'],
  ['personnel', 'Afficher sur les documents du personnel'],
  ['vehicules', 'Afficher sur les documents de véhicule'],
  ['equipement', 'Afficher sur les bons d’équipement'],
  ['conteneurs', 'Afficher sur les bons de conteneurs'],
  ['inspection', 'Afficher sur les rapports d’inspection'],
  ['reparation', 'Afficher dans les bons de réparation'],
  ['autres', 'Afficher sur d’autres documents'],
  ['preparation', 'Bon de préparation combiné'],
  ['etiquettes', 'Utiliser pour les étiquettes de matériel'],
]
export const VISIBILITY_OF_TYPE = { devis: 'devis', contrat: 'contrats', facture: 'factures', avoir: 'factures', preparation: 'preparation', livraison: 'equipement', feuille_route: 'personnel', autre: 'autres', commande: 'souslocation', etiquette: 'etiquettes' }
// Un en-tête n'est proposé pour les étiquettes que si on le demande (format d'étiquette)
const visibility = (on) => Object.fromEntries(VISIBILITY.map(([k]) => [k, k === 'etiquettes' ? false : on]))

export const blankLetterhead = (name = 'Nouvel en-tête') => ({
  id: uid('lh_'), name, background: null, auto: null, pageSize: 'A4', width: 21, height: 29.7,
  margins: { top: 3, right: 2, bottom: 2.5, left: 2, header: 1, footer: 1 }, firstPageBlank: false, pageNumbers: true, visibility: visibility(true),
})

/** Formats d'étiquette toujours proposés (en plus des en-têtes marqués « étiquettes »), non modifiables. */
export const LABEL_LETTERHEADS = LABEL_SIZES.map(([w, h]) => ({
  id: `lh_etiq_${w}x${h}`, name: `Étiquette ${w} × ${h} mm`, system: true, background: null, auto: null,
  pageSize: `Étiquette ${w} × ${h} mm`, width: w / 10, height: h / 10,
  margins: { top: 0.2, right: 0.25, bottom: 0.2, left: 0.25, header: 0, footer: 0 },
  firstPageBlank: false, pageNumbers: false, visibility: { etiquettes: true },
}))

export const DEFAULT_LETTERHEADS = [
  {
    id: 'lh_defaut', name: 'Par défaut', background: { kind: 'auto' },
    auto: { accent: '#1f87e5', tagline: 'Sonorisation · Éclairage · Vidéo · Structures', showContact: true, logoPosition: 'gauche', footer: true },
    pageSize: 'A4', width: 21, height: 29.7, margins: { top: 4.2, right: 1.8, bottom: 2.6, left: 1.8, header: 1.2, footer: 1.2 },
    firstPageBlank: false, pageNumbers: true, visibility: visibility(true),
  },
  {
    id: 'lh_preimprime', name: 'Papier pré-imprimé', background: null, auto: null,
    pageSize: 'A4', width: 21, height: 29.7, margins: { top: 5.5, right: 2, bottom: 3, left: 2.2, header: 0, footer: 0 },
    firstPageBlank: false, pageNumbers: true, visibility: { ...visibility(true), personnel: false, vehicules: false },
  },
  {
    id: 'lh_etiquette', name: 'Étiquette', background: null, auto: null,
    pageSize: 'Personnalisé', width: 10, height: 15, margins: { top: 0.6, right: 0.6, bottom: 0.6, left: 0.6, header: 0, footer: 0 },
    firstPageBlank: false, pageNumbers: false, visibility: visibility(false),
  },
]

// ---------- Modèles de texte (« Appliquer modèle » du texte du document) ----------
export const DEFAULT_TEXT_TEMPLATES = [
  { id: 'tt_devis', name: 'Proposition standard', type: 'devis', html: '<p>{$f.greeting}</p><p>Suite à votre demande, nous avons le plaisir de vous adresser notre proposition pour « {$f.project.name} ». Vous trouverez ci-dessous le détail du matériel, du personnel et des prestations prévus.</p><p>{$f.closing}</p>' },
  { id: 'tt_relance', name: 'Relance du devis', type: 'devis', html: '<p>{$f.greeting}</p><p>Nous revenons vers vous au sujet de notre offre {$f.number} pour « {$f.project.name} », valable jusqu’au {$f.expiry}. Il vous suffit de la signer en ligne pour confirmer la réservation du matériel.</p>' },
  { id: 'tt_contrat', name: 'Contrat de location', type: 'contrat', html: '<p>{$f.greeting}</p><p>Le présent contrat fixe les conditions de location du matériel et des prestations décrits ci-dessous pour « {$f.project.name} », du {$f.project.usageperiod_start} au {$f.project.usageperiod_end}.</p>' },
  { id: 'tt_facture', name: 'Facture standard', type: 'facture', html: '<p>{$f.greeting}</p><p>Veuillez trouver ci-dessous notre facture pour « {$f.project.name} ». Merci de procéder au règlement avant le {$f.duedate}, en indiquant la référence {$f.number}.</p>' },
  { id: 'tt_avoir', name: 'Note de crédit', type: 'avoir', html: '<p>{$f.greeting}</p><p>Vous trouverez ci-dessous la note de crédit relative à la facture {$f.quote}.</p>' },
  { id: 'tt_route', name: 'Consignes équipe', type: 'feuille_route', html: '<p>Rendez-vous au dépôt à l’heure du départ. Tenue noire, chaussures de sécurité et gants obligatoires. En cas de retard, prévenez {$f.project.accountmanager}.</p>' },
  { id: 'tt_merci', name: 'Remerciements', type: 'tous', html: '<p>Nous vous remercions pour votre confiance.</p><p>{$f.politeness}<br>{$user.name}</p>' },
]
