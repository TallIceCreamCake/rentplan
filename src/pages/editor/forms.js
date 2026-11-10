import { LABEL_FIELDS } from '../../lib/templates/defaults'
// Options affichées dans « Module sélectionné » pour chaque module (adv : paramètres avancés, sub : sous-option).
const ALIGN = [['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']]
const title = { k: 'title', label: 'Texte d’en-tête', type: 'text' }
const hideZero = { k: 'hideZeroLines', label: 'Masquer les lignes à prix nul', type: 'bool', adv: true }
const showAssigned = { k: 'showAssigned', label: 'Afficher les personnes affectées', type: 'bool' }
const showTotal = { k: 'showTotal', label: 'Afficher le total', type: 'bool' }

export const FIN_CHOICES = [['location', 'Équipement de location'], ['vente', 'Articles de vente'], ['personnel', 'Équipe'], ['transport', 'Transport'], ['autres', 'Coûts supplémentaires']]

export const OPTION_FORMS = {
  equipment: [
    title,
    { k: 'groupBy', label: 'Grouper par', type: 'select', options: [['groupes', 'Groupes d’équipement'], ['categorie', 'Catégories'], ['aucun', 'Aucun regroupement']] },
    { k: 'showGroupTitle', label: 'Afficher le nom des groupes', type: 'bool' },
    { k: 'showSubtotals', label: 'Afficher le total par groupe', type: 'bool' },
    { k: 'showContents', label: 'Afficher le contenu des combinaisons', type: 'bool' },
    { k: 'showAccessories', label: 'Afficher les accessoires', type: 'bool' },
    { k: 'optional', label: 'Articles optionnels', type: 'select', options: [['sans', 'Ne pas afficher'], ['avec', 'Afficher avec les autres articles'], ['uniquement', 'Uniquement les articles optionnels']] },
    { k: 'kind', label: 'Articles', type: 'select', options: [['tous', 'Location et vente'], ['location', 'Location uniquement'], ['vente', 'Vente uniquement']] },
    { k: 'warehouse', label: 'Statut d’entrepôt', type: 'select', options: [['tous', 'Tous les éléments'], ['prets', 'Uniquement les éléments actuellement prêts ou sur place'], ['a_preparer', 'Uniquement les éléments à préparer']], adv: true },
    { k: 'showGroupPeriod', label: 'Afficher la période d’utilisation des groupes', type: 'bool', adv: true },
    { k: 'showGroupRemark', label: 'Afficher les remarques des groupes', type: 'bool', adv: true },
    { k: 'showLineRemark', label: 'Afficher les remarques des articles', type: 'bool', adv: true },
    { k: 'hideZeroLines', label: 'Masquer les articles à prix nul', type: 'bool', adv: true },
    { k: 'subprojectTitle', label: 'Nom du sous-projet devant les groupes', type: 'select', options: [['auto', 'Automatique (plusieurs sous-projets)'], ['oui', 'Oui'], ['non', 'Non']], adv: true },
  ],
  equipmentGroups: [title, showTotal],
  functionGroups: [
    title,
    { k: 'include', label: 'Fonctions', type: 'select', options: [['tous', 'Équipe et transport'], ['equipe', 'Équipe uniquement'], ['transport', 'Transport uniquement']] },
    { k: 'showGroupTitle', label: 'Afficher le nom des groupes', type: 'bool' },
    { k: 'showSubtotals', label: 'Afficher le total par groupe', type: 'bool' },
    showAssigned,
    hideZero,
  ],
  crewFunctions: [title, showAssigned, showTotal, hideZero],
  transportFunctions: [title, showAssigned, showTotal, hideZero],
  crewPlanning: [title],
  vehiclePlanning: [title],
  costs: [title, showTotal, hideZero],
  planning: [
    title,
    { k: 'onlyExternal', label: 'Uniquement les périodes visibles par le client', type: 'bool' },
    { k: 'headerStyle', label: 'Affichage', type: 'select', options: [['titre', 'Titre au-dessus des lignes'], ['', 'En-tête de tableau']] },
  ],
  tasks: [title, { k: 'hideDone', label: 'Masquer les tâches terminées', type: 'bool' }],
  notes: [
    title,
    { k: 'scope', label: 'Notes affichées', type: 'select', options: [['externe', 'Notes externes'], ['interne', 'Notes internes'], ['entrepot', 'Notes d’entrepôt'], ['toutes', 'Toutes les notes']] },
    { k: 'projectRemark', label: 'Inclure la remarque externe du projet', type: 'bool' },
    { k: 'showAuthor', label: 'Afficher l’auteur', type: 'bool' },
  ],
  totals: [
    title,
    { section: 'Remises' },
    { k: 'showCategories', label: 'Afficher le total par catégorie', type: 'bool' },
    { k: 'categories', label: 'Choisir', type: 'multi', options: FIN_CHOICES, adv: true, sub: true },
    { k: 'emptyCategories', label: '', type: 'select', options: [['masquer', 'Masquer lorsque la catégorie est vide'], ['afficher', 'Toujours afficher lorsque la catégorie est vide']], adv: true, sub: true },
    { k: 'showGroupDiscount', label: 'Afficher la remise par groupe', type: 'bool' },
    { k: 'groupDiscountFrom', label: '', type: 'select', options: [['article', 'À partir de la remise d’article'], ['groupe', 'À partir de la remise de groupe']], adv: true, sub: true },
    { k: 'groupDiscountTo', label: '', type: 'select', options: [['projet', 'Jusqu’à la remise du projet'], ['groupe', 'Jusqu’à la remise du groupe']], adv: true, sub: true },
    { k: 'groupDiscountFormat', label: '', type: 'select', options: [['pourcentage', 'Pourcentage'], ['montant', 'Montant']], adv: true, sub: true },
    { k: 'showTotalDiscount', label: 'Remise totale', type: 'bool' },
    { k: 'totalDiscountTo', label: '', type: 'select', options: [['projet', 'Jusqu’à la remise du projet'], ['categorie', 'Jusqu’à la remise des catégories']], adv: true, sub: true },
    { k: 'totalDiscountFormat', label: '', type: 'select', options: [['montant', 'Montant'], ['pourcentage', 'Pourcentage']], adv: true, sub: true },
    { section: 'Vue d’ensemble' },
    { k: 'showInsurance', label: 'Afficher l’assurance', type: 'bool' },
    { k: 'showVat', label: 'Afficher TVA', type: 'bool' },
    { k: 'showDeposit', label: 'Afficher caution', type: 'bool' },
    { k: 'showPayments', label: 'Afficher les paiements', type: 'bool' },
    { k: 'extendNegative', label: 'Étendre la vue d’ensemble des factures négatives', type: 'bool' },
    { k: 'labelAlign', label: 'Colonne de gauche avec texte', type: 'select', options: [['gauche', 'Gauche'], ['droite', 'Droite']] },
  ],
  signature: [
    { k: 'title', label: 'Titre', type: 'text', vars: true },
    { k: 'mode', label: 'Type de signature', type: 'select', options: [['numerique', 'Signature numérique (bouton)'], ['manuscrite', 'Cadre pour signature manuscrite']] },
    { k: 'width', label: 'Largeur', type: 'number', unit: '%' },
    { k: 'align', label: 'Aligner', type: 'select', options: ALIGN },
  ],
  conditions: [title, { k: 'document', label: 'Conditions du document', type: 'bool' }, { k: 'subprojects', label: 'Conditions supplémentaires des sous-projets', type: 'bool' }],
  insurance: [title, { k: 'text', label: 'Texte', type: 'textarea', vars: true }, { k: 'showAmount', label: 'Afficher le montant', type: 'bool' }],
  documentText: [],
  payments: [title, { k: 'showBalance', label: 'Afficher le reste à payer', type: 'bool' }],
  bankDetails: [title, { k: 'showReference', label: 'Afficher la référence à indiquer', type: 'bool' }, { k: 'showMethods', label: 'Afficher les moyens de paiement', type: 'bool' }],
  paymentQr: [{ k: 'size', label: 'Taille', type: 'number', unit: 'cm' }, { k: 'caption', label: 'Légende', type: 'text' }, { k: 'align', label: 'Aligner', type: 'select', options: ALIGN }],
  qrCode: [
    { k: 'content', label: 'Contenu du QR code', type: 'select', options: [['numero', 'Numéro de série (scan à l’entrepôt)'], ['lien', 'Lien vers la fiche de l’équipement'], ['code', 'Code de l’équipement']] },
    { k: 'size', label: 'Taille', type: 'number', unit: 'cm' },
    { k: 'caption', label: 'Légende (variables possibles)', type: 'text', vars: true },
    { k: 'align', label: 'Aligner', type: 'select', options: ALIGN },
  ],
  equipmentDetails: [
    { k: 'fields', label: 'Informations affichées', type: 'multi', options: LABEL_FIELDS },
    { k: 'showLabels', label: 'Afficher les intitulés', type: 'bool' },
    { k: 'nameSize', label: 'Taille du nom', type: 'number', unit: 'pt' },
  ],
  equipmentImage: [{ k: 'height', label: 'Hauteur', type: 'number', unit: 'cm' }, { k: 'align', label: 'Aligner', type: 'select', options: ALIGN }],
}

export const MODULE_HELP = {
  qrCode: 'QR code de l’étiquette. « Numéro de série » : la douchette de l’entrepôt le lit pour préparer ou rentrer l’article ; « Lien » : un téléphone ouvre la fiche de l’équipement.',
  equipmentDetails: 'Informations de l’équipement et de son numéro de série, dans l’ordre choisi. Les champs vides ne s’affichent pas.',
  equipmentImage: 'Photo principale de la fiche de l’équipement.',
  equipment: 'Matériel planifié du projet, groupé comme dans l’onglet Équipement. Les colonnes se règlent dans l’onglet Colonnes.',
  documentText: 'Affiche le « Texte du document » saisi dans la fenêtre Générer (variables comprises).',
  signature: 'Le client clique sur le bouton pour signer en ligne : le document passe à « Accepté » et le projet d’Option à Confirmé. À activer dans Configuration › Communication.',
  paymentQr: 'QR code SEPA (EPC) : l’application bancaire du client pré-remplit le bénéficiaire, l’IBAN, le montant restant dû et la référence.',
  totals: 'Totaux par catégorie, remises, TVA, caution et paiements. Dans un bloc Sous-projets, la somme ne porte que sur le sous-projet.',
  conditions: 'Conditions du document (modifiables document par document) et conditions supplémentaires saisies dans l’onglet Finances des sous-projets.',
}

export const ALIGN_OPTIONS = ALIGN
export const OPS = [['==', '='], ['!=', '≠'], ['>', '>'], ['<', '<'], ['>=', '≥'], ['<=', '≤']]
export const HEADER_STYLES = [['', 'Comme le document'], ['encadre', 'Encadré'], ['ligne', 'Ligne inférieure'], ['fond', 'Fond coloré'], ['aucun', 'Aucun'], ['titre', 'Titre seul']]
