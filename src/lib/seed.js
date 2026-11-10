import { addDays, startOfDay, toDateInput, toLocalInput } from './utils'
import { buildDocument, DOC_SERIES } from './documents'
import { DEFAULT_LETTERHEADS, DEFAULT_TEXT_TEMPLATES } from './templates/defaults'

export const DEFAULT_SETTINGS = {
  companyName: 'Son & Lumière Events',
  logoUrl: '',
  website: 'www.sonlumiere-events.fr',
  userName: 'Administrateur',
  address: '12 rue des Entrepôts',
  zip: '44000',
  city: 'Nantes',
  email: 'contact@sonlumiere-events.fr',
  phone: '02 40 00 00 00',
  siret: '123 456 789 00012',
  vatNumber: 'FR12123456789',
  iban: 'FR76 3000 6000 0112 3456 7890 189',
  currency: 'EUR',
  vatRate: 20,
  nextProjectNumber: 101,
  quotePrefix: 'DEV-',
  nextQuoteNumber: 1,
  contractPrefix: 'CON-',
  nextContractNumber: 1,
  invoicePrefix: 'FAC-',
  nextInvoiceNumber: 1,
  creditPrefix: 'AV-',
  nextCreditNumber: 1,
  poPrefix: 'BC-',
  nextPoNumber: 1,
  subrentPrefix: 'SL-',
  nextSubrentNumber: 1,
  repairPrefix: 'REP-',
  nextRepairNumber: 1,
  quoteValidityDays: 14,
  paymentTermDays: 30,
  quoteTerms: 'Devis valable 14 jours. Acompte de 30 % à la commande. Matériel assuré par le loueur pendant la durée de la location.',
  invoiceTerms: 'Paiement à 30 jours par virement. Pénalités de retard : 3 fois le taux d’intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 €.',
  staffel: [
    { days: 1, factor: 1 },
    { days: 2, factor: 1.5 },
    { days: 3, factor: 2 },
    { days: 4, factor: 2.5 },
    { days: 5, factor: 3 },
    { days: 7, factor: 3.5 },
  ],
  staffelExtra: 0.25,
  crewSkills: ['Régisseur général', 'Ingénieur son', 'Technicien son', 'Éclairagiste', 'Technicien lumière', 'Technicien vidéo', 'Rigger', 'Technicien plateau', 'Chauffeur PL'],
  compact: false,

  // ---------- Compte ----------
  bic: 'AGRIFRPP847',
  bankName: 'Crédit Agricole Atlantique Vendée',
  accountHolder: 'Son & Lumière Events SAS',
  paymentMethods: ['Virement', 'Chèque', 'Carte bancaire'],
  // Extensions : modules optionnels de l'espace de travail
  extensions: { finances: true, heures: true, demandes: true, maintenance: true },

  // ---------- Paramètres ----------
  timezone: 'Europe/Paris',
  country: 'France',
  defaultStartHour: 9,
  defaultEndHour: 23,
  projectTemplates: [
    { id: 'tpl_conf', name: 'Conférence (sonorisation + vidéo)', typeId: 'pt_corp', items: [{ equipmentId: 'e_e8', quantity: 8 }, { equipmentId: 'e_cl5', quantity: 1 }, { equipmentId: 'e_ulxd', quantity: 6 }, { equipmentId: 'e_vp', quantity: 1 }, { equipmentId: 'e_ecran', quantity: 1 }], functions: ['df_ingson', 'df_vid'] },
    { id: 'tpl_concert', name: 'Concert plein air', typeId: 'pt_fest', items: [{ equipmentId: 'e_kara', quantity: 16 }, { equipmentId: 'e_sb18', quantity: 8 }, { equipmentId: 'e_cl5', quantity: 1 }, { equipmentId: 'e_mega', quantity: 12 }, { equipmentId: 'e_ma3', quantity: 1 }], functions: ['df_reg', 'df_ingson', 'df_ecl'] },
  ],
  inspectionTypes: [
    { id: 'it_vgp', name: 'Vérification générale périodique (VGP)', intervalMonths: 12, description: 'Contrôle réglementaire des appareils de levage par un organisme agréé.' },
    { id: 'it_elec', name: 'Contrôle électrique', intervalMonths: 12, description: 'Test d’isolement et de continuité des câbles et armoires.' },
    { id: 'it_elingues', name: 'Inspection des élingues', intervalMonths: 6, description: 'Contrôle visuel et marquage des élingues et manilles.' },
  ],
  defaultBreakMinutes: 30,
  defaultTravelMinutes: 0,
  annualLeaveDays: 25,
  warehouseLabels: { aPreparer: 'À préparer', pret: 'Prêt', surSite: 'Sur site', retourne: 'Retourné', perdu: 'Perdu' },
  // Frais de retour proposés (€ HT par unité) ; retard : % du tarif journalier de location par jour, après une marge en heures
  returnFees: { nettoyage: 15, entretien: 25, maintenance: 45, retardPct: 100, graceHours: 2 },
  autoWarehouseStatus: false,
  customFields: [
    { id: 'cf_acces', entity: 'projet', label: 'Accès poids lourd', type: 'case' },
    { id: 'cf_montage', entity: 'projet', label: 'Contact montage sur place', type: 'texte' },
    { id: 'cf_inventaire', entity: 'equipement', label: 'N° d’immobilisation', type: 'texte' },
    { id: 'cf_siren', entity: 'contact', label: 'Code client comptable', type: 'texte' },
  ],

  // ---------- Communication client ----------
  emailSettings: { senderName: 'Son & Lumière Events', replyTo: 'contact@sonlumiere-events.fr', subject: '{document} {numéro} — {projet}', body: 'Veuillez trouver ci-joint notre {document} {numéro} pour le projet « {projet} ».', signature: 'L’équipe Son & Lumière Events\n02 40 00 00 00' },
  // Modèles de documents créés par l'espace de travail (les modèles système sont dans le code)
  documentTemplates: [],
  hiddenSystemTemplates: [],
  defaultTemplates: {},
  letterheads: DEFAULT_LETTERHEADS,
  textTemplates: DEFAULT_TEXT_TEMPLATES,
  digitalSignature: { enabled: true, allowComments: true, allowExpired: false, logoUrl: '' },
  salutation: { formal: 'Madame, Monsieur,', personal: 'Bonjour {prénom},', usePersonal: true, closing: 'Nous restons à votre disposition pour toute question.', politeness: 'Cordialement,' },

  // ---------- Finance ----------
  einvoice: { enabled: false, format: 'UBL 2.1', platform: '', buyerReference: true },
  vatRegimes: [
    { id: 'tva_20', name: 'TVA normale', rate: 20, mention: '' },
    { id: 'tva_10', name: 'TVA intermédiaire', rate: 10, mention: '' },
    { id: 'tva_auto', name: 'Autoliquidation (UE)', rate: 0, mention: 'Autoliquidation — article 283-2 du CGI.' },
    { id: 'tva_export', name: 'Exportation hors UE', rate: 0, mention: 'Exonération de TVA — article 262 I du CGI.' },
  ],
  vatRegimeId: 'tva_20',
  paymentTerms: [
    { id: 'pt_0', name: 'Paiement à réception', days: 0 },
    { id: 'pt_30', name: '30 jours', days: 30 },
    { id: 'pt_45', name: '45 jours fin de mois', days: 45 },
    { id: 'pt_60', name: '60 jours', days: 60 },
  ],
  paymentTermId: 'pt_30',
}

const NOW_ISO = () => new Date().toISOString()

const CATEGORIES = [
  ['cat_son', 'Son', '#1f87e5', null],
  ['cat_son_diff', 'Diffusion', null, 'cat_son'],
  ['cat_son_cons', 'Consoles', null, 'cat_son'],
  ['cat_son_mic', 'Microphones', null, 'cat_son'],
  ['cat_lum', 'Lumière', '#f59e0b', null],
  ['cat_lum_lyres', 'Lyres', null, 'cat_lum'],
  ['cat_lum_proj', 'Projecteurs', null, 'cat_lum'],
  ['cat_lum_pup', 'Pupitres & effets', null, 'cat_lum'],
  ['cat_vid', 'Vidéo', '#7c3aed', null],
  ['cat_str', 'Structure & levage', '#64748b', null],
  ['cat_cab', 'Câblage & énergie', '#0d9488', null],
  ['cat_mob', 'Mobilier', '#db2777', null],
  ['cat_con', 'Consommables', '#65a30d', null],
].map(([id, name, color, parentId], i) => ({ id, name, color, parentId, sort: i }))

const eq = (id, categoryId, code, name, stock, rentalPrice, weight, extra = {}) => ({
  id,
  code,
  name,
  categoryId,
  kind: 'location',
  type: 'article',
  stock,
  serialized: false,
  rentalPrice,
  subrentalCost: Math.round(rentalPrice * 0.6),
  purchasePrice: Math.round(rentalPrice * 18),
  weight,
  volume: Math.round(weight * 0.006 * 1000) / 1000,
  power: 0,
  current: 0,
  location: '',
  defaultGroup: '',
  displayInPlanner: true,
  tags: [],
  internalRemark: '',
  externalRemark: '',
  imageUrl: null,
  contents: [],
  accessories: [],
  alternatives: [],
  supplierIds: [],
  archived: false,
  createdAt: NOW_ISO(),
  ...extra,
})

const EQUIPMENT = [
  eq('e_kara', 'cat_son_diff', 'SON-001', 'L-Acoustics Kara II', 24, 85, 26, { location: 'A1-01', power: 500, defaultGroup: 'Son', tags: ['line array'], alternatives: ['e_e8'], supplierIds: ['c_ouest'] }),
  eq('e_sb18', 'cat_son_diff', 'SON-002', 'L-Acoustics SB18 (sub)', 12, 70, 83, { location: 'A1-02', power: 700, defaultGroup: 'Son', supplierIds: ['c_ouest'] }),
  eq('e_e8', 'cat_son_diff', 'SON-003', 'd&b E8 enceinte coaxiale', 16, 35, 15, { location: 'A1-03', power: 300, defaultGroup: 'Son' }),
  eq('e_m4', 'cat_son_diff', 'SON-004', 'd&b M4 retour de scène', 12, 40, 22, { location: 'A1-04', power: 400, defaultGroup: 'Son' }),
  eq('e_cl5', 'cat_son_cons', 'SON-010', 'Yamaha CL5 console numérique', 0, 350, 36, { location: 'A2-01', serialized: true, power: 300, defaultGroup: 'Son' }),
  eq('e_sq6', 'cat_son_cons', 'SON-011', 'Allen & Heath SQ-6', 0, 180, 18, { location: 'A2-02', serialized: true, power: 150, defaultGroup: 'Son' }),
  eq('e_sm58', 'cat_son_mic', 'SON-020', 'Shure SM58', 40, 6, 0.3, { location: 'A3-01', tags: ['mic'], accessories: [{ equipmentId: 'e_xlr10', quantity: 1, free: true }] }),
  eq('e_ulxd', 'cat_son_mic', 'SON-021', 'Shure ULXD micro HF main', 16, 45, 1.2, { location: 'A3-02', tags: ['mic', 'hf'], accessories: [{ equipmentId: 'e_piles', quantity: 1, free: false }] }),
  eq('e_di', 'cat_son_mic', 'SON-030', 'Boîte de direct active', 20, 5, 1, { location: 'A3-03' }),
  eq('e_kit_conf', 'cat_son', 'SON-100', 'Kit sono conférence', 0, 220, 0, { type: 'kit', contents: [{ equipmentId: 'e_e8', quantity: 2 }, { equipmentId: 'e_sq6', quantity: 1 }, { equipmentId: 'e_ulxd', quantity: 2 }, { equipmentId: 'e_xlr10', quantity: 4 }], externalRemark: 'Système complet pour une salle de 150 personnes.' }),
  eq('e_case_sm58', 'cat_son_mic', 'SON-101', 'Flight case 6 × Shure SM58', 4, 30, 9, { type: 'case', location: 'A3-04', contents: [{ equipmentId: 'e_sm58', quantity: 6 }] }),

  eq('e_aura', 'cat_lum_lyres', 'LUM-001', 'Martin MAC Aura XB', 24, 65, 7, { location: 'B1-01', power: 400, alternatives: ['e_par'] }),
  eq('e_mega', 'cat_lum_lyres', 'LUM-002', 'Robe MegaPointe', 16, 95, 22, { location: 'B1-02', power: 670 }),
  eq('e_par', 'cat_lum_proj', 'LUM-003', 'PAR LED RGBW 18×10W', 60, 12, 4, { location: 'B2-01', power: 180 }),
  eq('e_s4', 'cat_lum_proj', 'LUM-004', 'Découpe ETC Source Four 750W', 20, 15, 8, { location: 'B2-02', power: 750 }),
  eq('e_ma3', 'cat_lum_pup', 'LUM-010', 'grandMA3 compact XT', 0, 400, 28, { location: 'B3-01', serialized: true, power: 300 }),
  eq('e_hazer', 'cat_lum_pup', 'LUM-020', 'Machine à brouillard (hazer)', 6, 40, 12, { location: 'B3-02', power: 1500, accessories: [{ equipmentId: 'e_fluide', quantity: 1, free: false }] }),

  eq('e_vp', 'cat_vid', 'VID-001', 'Vidéoprojecteur laser 20 000 lm', 0, 450, 60, { location: 'C1-01', serialized: true, power: 2000 }),
  eq('e_led', 'cat_vid', 'VID-002', 'Dalle écran LED P3.9 50×50', 120, 25, 8, { location: 'C2-01', power: 200 }),
  eq('e_atem', 'cat_vid', 'VID-003', 'Mélangeur Blackmagic ATEM', 0, 150, 5, { location: 'C1-02', serialized: true, power: 100 }),
  eq('e_ecran', 'cat_vid', 'VID-004', 'Écran de projection 4×3 m', 4, 90, 30, { location: 'C3-01' }),
  eq('e_moni', 'cat_vid', 'VID-005', 'Moniteur 55" 4K', 10, 70, 18, { location: 'C3-02', power: 150 }),

  eq('e_truss', 'cat_str', 'STR-001', 'Structure alu carrée 3 m', 40, 15, 14, { location: 'D1-01' }),
  eq('e_genie', 'cat_str', 'STR-002', 'Pied de levage Genie', 8, 60, 65, { location: 'D1-02' }),
  eq('e_moteur', 'cat_str', 'STR-003', 'Moteur de levage 1 T', 12, 55, 45, { location: 'D2-01', power: 1100 }),
  eq('e_prat', 'cat_str', 'STR-004', 'Praticable scène 2×1 m', 60, 18, 35, { location: 'D3-01' }),

  eq('e_xlr10', 'cat_cab', 'CAB-001', 'Câble XLR 10 m', 150, 1.5, 0.6, { location: 'E1-01' }),
  eq('e_armoire', 'cat_cab', 'CAB-010', 'Armoire électrique 63 A', 6, 60, 40, { location: 'E2-01' }),
  eq('e_p17', 'cat_cab', 'CAB-011', 'Rallonge P17 32 A 25 m', 30, 6, 9, { location: 'E2-02' }),
  eq('e_groupe', 'cat_cab', 'CAB-020', 'Groupe électrogène 100 kVA', 0, 550, 1800, { location: 'Extérieur', serialized: true }),

  eq('e_mange', 'cat_mob', 'MOB-001', 'Mange-debout', 80, 9, 12, { location: 'F1-01' }),
  eq('e_chaise', 'cat_mob', 'MOB-002', 'Chaise pliante', 400, 2, 4, { location: 'F2-01' }),
  eq('e_table', 'cat_mob', 'MOB-003', 'Table ronde Ø180 cm', 60, 12, 25, { location: 'F1-02' }),

  eq('e_gaffer', 'cat_con', 'CON-001', 'Gaffer noir 50 mm', 200, 12, 0.3, { kind: 'vente', location: 'G1-01', purchasePrice: 6 }),
  eq('e_piles', 'cat_con', 'CON-002', 'Piles AA (lot de 4)', 300, 4, 0.1, { kind: 'vente', location: 'G1-02', purchasePrice: 2 }),
  eq('e_fluide', 'cat_con', 'CON-003', 'Liquide à brouillard 5 L', 40, 35, 5, { kind: 'vente', location: 'G1-03', purchasePrice: 18 }),
]

const SERIAL_SPECS = [
  ['e_cl5', 'CL5', 2],
  ['e_sq6', 'SQ6', 3],
  ['e_ma3', 'MA3', 2],
  ['e_vp', 'VP', 3],
  ['e_atem', 'ATEM', 2],
  ['e_groupe', 'GE', 2],
]

const contact = (id, type, company, firstName, lastName, extra = {}) => ({
  id,
  type,
  isCompany: Boolean(company),
  company,
  firstName,
  lastName,
  email: '',
  phone: '',
  website: '',
  address: '',
  zip: '',
  city: '',
  country: 'France',
  vatNumber: '',
  discountEquipment: 0,
  discountCrew: 0,
  paymentTermDays: null,
  notes: '',
  tags: [],
  createdAt: NOW_ISO(),
  ...extra,
})

const CONTACTS = [
  contact('c_lumen', 'client', 'Agence Lumen Events', 'Claire', 'Martin', { email: 'claire@lumen-events.fr', phone: '01 42 00 11 22', address: '8 boulevard Haussmann', zip: '75009', city: 'Paris', vatNumber: 'FR45812345678', discountEquipment: 10, notes: 'Client récurrent, conditions préférentielles −10 % sur le matériel.', tags: ['agence'] }),
  contact('c_nantes', 'client', 'Mairie de Nantes', 'Pierre', 'Lefèvre', { email: 'evenements@nantes.fr', phone: '02 40 41 90 00', address: '2 rue de l’Hôtel de Ville', zip: '44000', city: 'Nantes', paymentTermDays: 45, notes: 'Bon de commande obligatoire avant facturation.', tags: ['institution'] }),
  contact('c_terrasses', 'client', 'Festival des Terrasses', 'Inès', 'Garcia', { email: 'prod@festival-terrasses.fr', phone: '06 12 34 56 78', address: '15 quai de la Fosse', zip: '44000', city: 'Nantes', tags: ['festival'] }),
  contact('c_techcorp', 'client', 'TechCorp France', 'Antoine', 'Girard', { email: 'a.girard@techcorp.fr', phone: '01 70 00 00 01', address: '45 avenue de la Grande Armée', zip: '75016', city: 'Paris', vatNumber: 'FR98765432101', tags: ['corporate'] }),
  contact('c_theatre', 'client', 'Le Grand Théâtre', 'Marie', 'Fontaine', { email: 'technique@grandtheatre.fr', phone: '02 51 00 00 00', address: 'Place Graslin', zip: '44000', city: 'Nantes' }),
  contact('c_pixel', 'client', 'Studio Pixel Production', 'Hugo', 'Blanc', { email: 'hugo@studiopixel.fr', phone: '06 98 76 54 32', address: '3 rue Crébillon', zip: '44000', city: 'Nantes' }),
  contact('c_ondes', 'client', 'Les Ondes (production)', 'Lucie', 'Perrin', { email: 'tour@lesondes.fr', phone: '06 45 45 45 45', address: '5 rue de Strasbourg', zip: '44000', city: 'Nantes', tags: ['tournée'] }),
  contact('c_jazz', 'client', 'Association Jazz en Loire', 'Bruno', 'Caillaud', { email: 'contact@jazzenloire.fr', phone: '06 33 22 11 00', address: '18 rue du Port', zip: '49000', city: 'Angers' }),
  contact('c_zenith', 'lieu', 'Zénith Nantes Métropole', null, null, { email: 'regie@zenith-nantes.fr', phone: '02 40 48 97 30', address: 'Boulevard du Zénith', zip: '44800', city: 'Saint-Herblain', notes: 'Accès quai de déchargement par l’arrière. Hauteur sous grill 18 m.' }),
  contact('c_palais', 'lieu', 'Palais des Congrès de Paris', null, null, { email: 'logistique@viparis.com', phone: '01 40 68 22 22', address: '2 place de la Porte Maillot', zip: '75017', city: 'Paris', notes: 'Créneaux de livraison à réserver 48 h avant.' }),
  contact('c_domaine', 'lieu', 'Domaine de la Loire', null, null, { email: 'contact@domaine-loire.fr', phone: '02 41 00 00 00', address: 'Route des Vignes', zip: '49000', city: 'Angers' }),
  contact('c_ouest', 'fournisseur', 'Sono Location Ouest', 'Paul', 'Henry', { email: 'paul@sono-ouest.fr', phone: '02 99 00 00 00', address: 'ZA de la Janais', zip: '35000', city: 'Rennes', notes: 'Sous-location son / lumière.' }),
]

const PERSONS = [
  ['cp_lumen1', 'c_lumen', 'Claire', 'Martin', 'claire@lumen-events.fr', '06 10 20 30 40', 'Cheffe de projet'],
  ['cp_lumen2', 'c_lumen', 'Yanis', 'Roche', 'yanis@lumen-events.fr', '06 11 22 33 44', 'Directeur de production'],
  ['cp_nantes', 'c_nantes', 'Pierre', 'Lefèvre', 'p.lefevre@nantes.fr', '06 01 02 03 04', 'Service événementiel'],
  ['cp_terr', 'c_terrasses', 'Inès', 'Garcia', 'prod@festival-terrasses.fr', '06 12 34 56 78', 'Production'],
  ['cp_tech', 'c_techcorp', 'Antoine', 'Girard', 'a.girard@techcorp.fr', '06 70 00 00 01', 'Responsable événements'],
  ['cp_theatre', 'c_theatre', 'Marie', 'Fontaine', 'technique@grandtheatre.fr', '06 51 00 00 00', 'Directrice technique'],
  ['cp_pixel', 'c_pixel', 'Hugo', 'Blanc', 'hugo@studiopixel.fr', '06 98 76 54 32', 'Producteur'],
  ['cp_ondes', 'c_ondes', 'Lucie', 'Perrin', 'tour@lesondes.fr', '06 45 45 45 45', 'Régisseuse de tournée'],
].map(([id, contactId, firstName, lastName, email, phone, role]) => ({ id, contactId, firstName, lastName, email, phone, role }))

const CREW = [
  ['cr_julien', 'Julien', 'Moreau', ['Ingénieur son', 'Technicien son'], 380, 45, 28, '#2563eb', 'Permis B, CACES nacelle.'],
  ['cr_sophie', 'Sophie', 'Laurent', ['Éclairagiste', 'Technicien lumière'], 380, 45, 28, '#f59e0b', 'Pupitreuse grandMA3.'],
  ['cr_karim', 'Karim', 'Benali', ['Régisseur général'], 420, 50, 32, '#16a34a', ''],
  ['cr_emma', 'Emma', 'Petit', ['Technicien vidéo'], 340, 40, 26, '#7c3aed', 'Spécialiste mur LED.'],
  ['cr_lucas', 'Lucas', 'Bernard', ['Rigger', 'Technicien plateau'], 360, 42, 27, '#64748b', 'Habilitation travail en hauteur.'],
  ['cr_chloe', 'Chloé', 'Dubois', ['Technicien plateau', 'Technicien lumière'], 260, 32, 20, '#db2777', ''],
  ['cr_thomas', 'Thomas', 'Roux', ['Chauffeur PL'], 250, 30, 19, '#0d9488', 'Permis C + CE.'],
  ['cr_nadia', 'Nadia', 'Haddad', ['Ingénieur son'], 400, 48, 30, '#ea580c', 'Mixage retours.'],
].map(([id, firstName, lastName, functions, dayRate, hourRate, costRate, color, notes]) => ({
  id,
  firstName,
  lastName,
  email: `${firstName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${lastName.toLowerCase()}@mail.fr`,
  phone: '06 00 00 00 00',
  functions,
  dayRate,
  hourRate,
  costRate,
  color,
  notes,
  tags: functions,
  active: true,
  city: 'Nantes',
}))

const VEHICLES = [
  { id: 'v_util', name: 'Utilitaire 12 m³', plate: 'MN-012-OP', type: 'Utilitaire', capacityKg: 1200, volume: 12, seats: 3, dayRate: 110, costPerKm: 0.45, notes: '', tags: [] },
  { id: 'v_20', name: 'Camion 20 m³ hayon', plate: 'AB-123-CD', type: 'Camion VL', capacityKg: 1000, volume: 20, seats: 3, dayRate: 180, costPerKm: 0.6, notes: 'Hayon 750 kg.', tags: [] },
  { id: 'v_19t', name: 'Porteur 19 T', plate: 'EF-456-GH', type: 'Poids lourd', capacityKg: 9000, volume: 50, seats: 2, dayRate: 350, costPerKm: 1.1, notes: '', tags: [] },
  { id: 'v_semi', name: 'Semi-remorque 90 m³', plate: 'IJ-789-KL', type: 'Semi', capacityKg: 24000, volume: 90, seats: 2, dayRate: 550, costPerKm: 1.6, notes: 'Chauffeur CE obligatoire.', tags: [] },
]

const PROJECT_TYPES = [
  { id: 'pt_fest', name: 'Concert / festival', color: '#f4511e' },
  { id: 'pt_corp', name: 'Corporate', color: '#7e57c2' },
  { id: 'pt_spec', name: 'Spectacle', color: '#ec407a' },
  { id: 'pt_inst', name: 'Institutionnel', color: '#26a69a' },
  { id: 'pt_loc', name: 'Location sèche', color: '#29b6f6' },
]

const DEFAULT_FUNCTIONS = [
  ['df_reg', 'equipe', 'Régisseur général', 50, 'heure', 32],
  ['df_ingson', 'equipe', 'Ingénieur son', 48, 'heure', 30],
  ['df_techson', 'equipe', 'Technicien son', 40, 'heure', 26],
  ['df_ecl', 'equipe', 'Éclairagiste', 48, 'heure', 30],
  ['df_techlum', 'equipe', 'Technicien lumière', 38, 'heure', 24],
  ['df_vid', 'equipe', 'Technicien vidéo', 42, 'heure', 27],
  ['df_rig', 'equipe', 'Rigger', 45, 'heure', 29],
  ['df_plat', 'equipe', 'Technicien plateau', 32, 'heure', 20],
  ['df_chauf', 'equipe', 'Chauffeur PL', 30, 'heure', 19],
  ['df_tr_util', 'transport', 'Transport utilitaire 12 m³', 0.9, 'km', 0.45],
  ['df_tr_20', 'transport', 'Transport camion 20 m³', 1.2, 'km', 0.6],
  ['df_tr_19', 'transport', 'Transport porteur 19 T', 1.9, 'km', 1.1],
  ['df_tr_semi', 'transport', 'Transport semi-remorque', 2.4, 'km', 1.6],
].map(([id, kind, name, price, priceType, cost]) => ({ id, kind, name, internalName: name, price, priceType, cost, costType: priceType, breakMinutes: kind === 'equipe' ? 30 : 0, tags: [name] }))

const DEFAULT_COSTS = [
  { id: 'dc_repas', name: 'Repas équipe', quantity: 1, price: 18, cost: 12 },
  { id: 'dc_hotel', name: 'Nuitée hôtel', quantity: 1, price: 95, cost: 80 },
  { id: 'dc_peage', name: 'Péages et parking', quantity: 1, price: 40, cost: 40 },
  { id: 'dc_livraison', name: 'Livraison et reprise', quantity: 1, price: 150, cost: 90 },
]

/** Données de démonstration complètes (collections plates, dates relatives à aujourd'hui). */
export function createSeed() {
  const T = startOfDay(new Date())
  const at = (d, h = 9, m = 0) => {
    const x = addDays(T, d)
    x.setHours(h, m, 0, 0)
    return toLocalInput(x)
  }
  const day = (d) => toDateInput(addDays(T, d))
  let n = 0
  const id = (p) => `${p}_${(++n).toString(36)}`
  const I = 'Import'

  const out = {
    settings: { ...DEFAULT_SETTINGS },
    categories: CATEGORIES,
    stockLocations: [
      { id: 'sl_nantes', name: 'Entrepôt Nantes', address: '12 rue des Entrepôts, 44000 Nantes', kind: 'entrepot', isDefault: true },
      { id: 'sl_rennes', name: 'Entrepôt Rennes', address: 'ZA de la Janais, 35000 Rennes', kind: 'entrepot', isDefault: false },
    ],
    projectTypes: PROJECT_TYPES,
    defaultFunctions: DEFAULT_FUNCTIONS,
    defaultCosts: DEFAULT_COSTS,
    contacts: CONTACTS,
    contactPersons: PERSONS,
    crew: CREW,
    crewAvailability: [],
    vehicles: VEHICLES,
    equipment: EQUIPMENT,
    serials: [],
    repairs: [],
    inspections: [],
    projects: [],
    subprojects: [],
    periods: [],
    equipmentGroups: [],
    plannedEquipment: [],
    bookings: [],
    functionGroups: [],
    functions: [],
    assignments: [],
    costs: [],
    notes: [],
    tasks: [],
    documents: [],
    subrents: [],
    returnCharges: [],
    purchaseOrders: [],
    timeEntries: [],
    requests: [],
    files: [],
  }

  for (const [eqId, prefix, count] of SERIAL_SPECS)
    for (let i = 0; i < count; i++)
      out.serials.push({ id: `sn_${prefix.toLowerCase()}_${i + 1}`, equipmentId: eqId, serial: `${prefix}-${1001 + i}`, internalRef: `${prefix}-${String(i + 1).padStart(3, '0')}`, stockLocationId: i === 2 ? 'sl_rennes' : 'sl_nantes', status: 'ok', notes: '', purchaseDate: day(-400 - i * 30) })

  const eqById = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]))
  let pnum = 100

  /**
   * spec : { key, name, client, person, venue, type, subs: [{ name, status, plan:[j,h,j,h], use:[j,h,j,h,min,min], groups, crew, transport, costs }] }
   * groupe : [nom, [[eqId, qté, extra]]] ; équipe : [fonction, crewId|null, [j,h,j,h], prix/h, coût/h, qté, extra] ; transport : [nom, vehicleId|null, [j,h,j,h], km, prix/km]
   */
  const project = (spec) => {
    const pid = `p_${spec.key}`
    pnum += 1
    out.projects.push({
      id: pid,
      number: String(pnum),
      name: spec.name,
      typeId: spec.type,
      clientId: spec.client || null,
      contactPersonId: spec.person || null,
      venueId: spec.venue || null,
      accountManager: 'Karim Benali',
      color: null,
      externalRef: spec.ref || null,
      stockLocationId: 'sl_nantes',
      notes: spec.notes || '',
      externalNotes: '',
      tags: spec.tags || [],
      createdAt: addDays(T, (spec.subs[0].plan[0] || 0) - 30).toISOString(),
      updatedBy: I,
    })
    const multi = spec.subs.length > 1
    spec.subs.forEach((s, si) => {
      const sid = `${pid}_sp${si + 1}`
      out.subprojects.push({
        id: sid,
        projectId: pid,
        name: s.name || spec.name,
        sort: si,
        status: s.status,
        discounts: s.discounts || {},
        discountTotal: 0,
        lockedTotal: null,
        insurancePct: s.insurance || 0,
        deposit: s.deposit || 0,
        depositStatus: s.deposit ? 'versee' : 'aucune',
        additionalConditions: '',
        updatedBy: I,
      })
      // Périodes : au niveau du projet s'il n'y a qu'un sous-projet, sinon propres à chaque sous-projet
      const owner = multi ? sid : null
      const pp = { id: id('per'), projectId: pid, subprojectId: owner, name: 'Période de planification', startsAt: at(s.plan[0], s.plan[1]), endsAt: at(s.plan[2], s.plan[3]), isPlanning: true, isUsage: false, showInternal: true, showExternal: false, sort: 0, updatedBy: I }
      const up = { id: id('per'), projectId: pid, subprojectId: owner, name: 'Période d’utilisation', startsAt: at(s.use[0], s.use[1], s.use[4] || 0), endsAt: at(s.use[2], s.use[3], s.use[5] || 0), isPlanning: false, isUsage: true, showInternal: true, showExternal: true, sort: 1, updatedBy: I }
      out.periods.push(pp, up)
      ;(s.extraPeriods || []).forEach((x, k) =>
        out.periods.push({ id: id('per'), projectId: pid, subprojectId: owner, name: x[0], startsAt: at(x[1], x[2]), endsAt: at(x[3], x[4]), isPlanning: false, isUsage: false, showInternal: true, showExternal: false, sort: 2 + k, updatedBy: I }),
      )

      // Matériel (avec contenu des kits/cases et accessoires)
      ;(s.groups || []).forEach(([gname, items], gi) => {
        const gid = id('g')
        out.equipmentGroups.push({ id: gid, projectId: pid, subprojectId: sid, name: gname, sort: gi, planningPeriodId: pp.id, usagePeriodId: up.id, planStart: null, planEnd: null, useStart: null, useEnd: null, remark: '', updatedBy: I })
        let sort = 0
        const line = (extra) => ({ id: id('pe'), projectId: pid, subprojectId: sid, groupId: gid, parentId: null, relation: 'principal', name: null, price: null, discount: 0, isOptional: false, reservedQty: 0, serialIds: [], sort: sort++, remark: '', updatedBy: I, ...extra })
        for (const [eqId, qty, extra = {}] of items) {
          const e = eqById[eqId]
          const parent = line({ equipmentId: eqId, quantity: qty, ...extra })
          out.plannedEquipment.push(parent)
          for (const c of e.contents || []) out.plannedEquipment.push(line({ equipmentId: c.equipmentId, parentId: parent.id, relation: 'contenu', quantity: c.quantity * qty, price: 0 }))
          for (const a of e.accessories || []) out.plannedEquipment.push(line({ equipmentId: a.equipmentId, parentId: parent.id, relation: 'accessoire', quantity: a.quantity * qty, price: a.free ? 0 : null }))
        }
      })

      // Équipe et transport
      const fgId = id('fg')
      if ((s.crew || []).length || (s.transport || []).length)
        out.functionGroups.push({ id: fgId, projectId: pid, subprojectId: sid, name: 'Équipe technique', sort: 0, planningPeriodId: pp.id, usagePeriodId: up.id, updatedBy: I })
      const fn = (extra) => ({ id: id('fn'), projectId: pid, subprojectId: sid, groupId: fgId, internalName: extra.name, quantity: 1, planningPeriodId: null, usagePeriodId: null, travelMinutes: 0, tags: [], remark: '', updatedBy: I, ...extra })
      ;(s.crew || []).forEach(([fname, crewId, tm, price, cost, qty = 1, extra = {}], fi) => {
        const f = fn({ kind: 'equipe', name: fname, quantity: qty, planStart: at(tm[0], tm[1]), planEnd: at(tm[2], tm[3]), useStart: at(tm[0], tm[1]), useEnd: at(tm[2], tm[3]), breakMinutes: 30, priceType: 'heure', price, costType: 'heure', cost, distanceKm: 0, tags: [fname], sort: fi })
        out.functions.push(f)
        if (crewId)
          out.assignments.push({ id: id('as'), projectId: pid, subprojectId: sid, functionId: f.id, crewId, vehicleId: null, planStart: null, planEnd: null, rate: null, visible: extra.visible ?? true, invitation: extra.invitation || 'accepte', remark: '', updatedBy: I })
      })
      ;(s.transport || []).forEach(([fname, vehicleId, tm, km, price = 1.9], ti) => {
        const v = VEHICLES.find((x) => x.id === vehicleId)
        const f = fn({ kind: 'transport', name: fname, planStart: at(tm[0], tm[1]), planEnd: at(tm[2], tm[3]), useStart: at(tm[0], tm[1]), useEnd: at(tm[2], tm[3]), breakMinutes: 0, priceType: 'km', price, costType: 'km', cost: v?.costPerKm || 1, distanceKm: km, sort: 100 + ti })
        out.functions.push(f)
        if (vehicleId) out.assignments.push({ id: id('as'), projectId: pid, subprojectId: sid, functionId: f.id, crewId: null, vehicleId, planStart: null, planEnd: null, rate: null, visible: true, invitation: 'aucune', remark: '', updatedBy: I })
      })
      ;(s.costs || []).forEach(([cname, qty, price, cost], ci) =>
        out.costs.push({ id: id('cs'), projectId: pid, subprojectId: sid, name: cname, quantity: qty, price, cost, discount: 0, remark: '', sort: ci, updatedBy: I }),
      )

      // Statut d'entrepôt cohérent avec le statut du sous-projet
      const field = { pret: 'pret', sur_site: 'surSite', retourne: 'retourne' }[s.status]
      if (field) {
        const qty = {}
        for (const l of out.plannedEquipment.filter((x) => x.subprojectId === sid)) {
          const e = eqById[l.equipmentId]
          if (!e || e.type === 'kit') continue
          if (l.relation === 'contenu' && eqById[out.plannedEquipment.find((p) => p.id === l.parentId)?.equipmentId]?.type === 'case') continue
          qty[e.id] = (qty[e.id] || 0) + l.quantity
        }
        for (const [eqId, q] of Object.entries(qty))
          out.bookings.push({ id: `${sid}:${eqId}`, projectId: pid, subprojectId: sid, equipmentId: eqId, pret: 0, surSite: 0, retourne: 0, perdu: 0, [field]: q, updatedBy: I })
      }
    })
    return pid
  }

  // ---------- Historique ----------
  const PAST_DAYS = { congres: -151, fete: -128, showcase: -101, terr_ete: -82, galatc: -62 }
  const past = (key, name, client, type, groups, crew = [], discounts = {}) => {
    const d = PAST_DAYS[key]
    project({ key, name, client, type, subs: [{ status: 'retourne', plan: [d - 1, 8, d + 2, 12], use: [d, 9, d + 1, 23], groups, crew: crew.map(([f, c, p, k]) => [f, c, [d, 8, d + 1, 23], p, k]), discounts }] })
  }
  past('congres', 'Congrès médical Atlantique', 'c_lumen', 'pt_corp', [['Plénière', [['e_e8', 12], ['e_cl5', 1], ['e_ulxd', 10], ['e_vp', 2], ['e_ecran', 2]]]], [['Ingénieur son', 'cr_julien', 48, 30], ['Technicien vidéo', 'cr_emma', 42, 27]], { location: 10 })
  past('fete', 'Fête de la musique — Place Royale', 'c_nantes', 'pt_inst', [['Scène', [['e_kara', 12], ['e_sb18', 6], ['e_cl5', 1], ['e_m4', 6], ['e_sm58', 16]]], ['Lumière', [['e_aura', 12], ['e_par', 24], ['e_ma3', 1]]]], [['Ingénieur son', 'cr_nadia', 48, 30], ['Éclairagiste', 'cr_sophie', 48, 30]])
  past('showcase', 'Showcase Studio Pixel', 'c_pixel', 'pt_corp', [['Showcase', [['e_e8', 6], ['e_sq6', 1], ['e_led', 32], ['e_atem', 1]]]], [['Technicien vidéo', 'cr_emma', 42, 27]])
  past('terr_ete', 'Festival des Terrasses — Édition été', 'c_terrasses', 'pt_fest', [['Façade', [['e_kara', 24], ['e_sb18', 12], ['e_cl5', 2]]], ['Lumière', [['e_mega', 16], ['e_aura', 16], ['e_ma3', 1], ['e_hazer', 2]]], ['Structure', [['e_truss', 30], ['e_moteur', 10], ['e_groupe', 1]]]], [['Régisseur général', 'cr_karim', 50, 32], ['Ingénieur son', 'cr_julien', 48, 30], ['Rigger', 'cr_lucas', 45, 29]])
  past('galatc', 'Soirée de gala TechCorp', 'c_techcorp', 'pt_corp', [['Salle', [['e_par', 30], ['e_e8', 8], ['e_sq6', 1], ['e_table', 40], ['e_chaise', 320]]]], [['Technicien lumière', 'cr_chloe', 38, 24]])

  project({ key: 'printemps', name: 'Séminaire Lumen — Printemps', client: 'c_lumen', person: 'cp_lumen1', venue: 'c_palais', type: 'pt_corp', subs: [{ status: 'retourne', plan: [-46, 8, -43, 12], use: [-45, 9, -44, 18], groups: [['Sonorisation salle', [['e_e8', 8], ['e_sq6', 1], ['e_ulxd', 6], ['e_xlr10', 20]]]], crew: [['Ingénieur son', 'cr_julien', [-45, 8, -44, 19], 48, 30]], discounts: { location: 10 } }] })
  project({ key: 'spectacle', name: 'Spectacle de fin de saison', client: 'c_theatre', person: 'cp_theatre', type: 'pt_spec', subs: [{ status: 'retourne', plan: [-31, 8, -27, 12], use: [-30, 14, -28, 23], groups: [['Lumière', [['e_aura', 12], ['e_s4', 16], ['e_ma3', 1], ['e_hazer', 2]]], ['Son', [['e_kara', 8], ['e_sb18', 4], ['e_cl5', 1]]]], crew: [['Éclairagiste', 'cr_sophie', [-30, 10, -28, 23], 48, 30], ['Ingénieur son', 'cr_nadia', [-30, 10, -28, 23], 48, 30]] }] })
  project({ key: 'automne', name: 'Séminaire Lumen — Automne', client: 'c_lumen', person: 'cp_lumen2', venue: 'c_palais', type: 'pt_corp', subs: [{ status: 'retourne', plan: [-13, 8, -10, 12], use: [-12, 8, -11, 19], groups: [['Plénière', [['e_e8', 8], ['e_sq6', 1], ['e_ulxd', 8], ['e_vp', 2], ['e_ecran', 2]]]], crew: [['Ingénieur son', 'cr_julien', [-12, 7, -11, 19], 48, 30], ['Technicien vidéo', 'cr_emma', [-12, 7, -11, 19], 42, 27]], transport: [['Transport camion 20 m³', 'v_20', [-13, 7, -10, 20], 780, 1.2]], discounts: { location: 10 } }] })

  // ---------- En cours et à venir ----------
  project({ key: 'gala', name: 'Gala de la Ville de Nantes', client: 'c_nantes', person: 'cp_nantes', type: 'pt_inst', ref: 'BC-VDN-2026-118', notes: 'Accès par le quai B. Badge à retirer au poste de sécurité.', subs: [{ status: 'sur_site', plan: [-2, 8, 1, 14], use: [-1, 18, 1, 2], groups: [['Éclairage d’ambiance', [['e_par', 40], ['e_aura', 8], ['e_ma3', 1]]], ['Mobilier', [['e_table', 30], ['e_chaise', 300], ['e_mange', 20]]], ['Discours', [['e_kit_conf', 1]]]], crew: [['Régisseur général', 'cr_karim', [-1, 12, 1, 3], 50, 32], ['Technicien lumière', 'cr_chloe', [-2, 8, 1, 3], 38, 24], ['Technicien son', 'cr_nadia', [-1, 14, 1, 2], 40, 26], ['Chauffeur PL', 'cr_thomas', [-2, 7, -2, 12], 30, 19]], transport: [['Transport porteur 19 T', 'v_19t', [-2, 7, 1, 20], 60]], costs: [['Repas équipe', 6, 18, 12]], deposit: 1500 }] })
  project({ key: 'electro', name: 'Festival Électro Plein Air', client: 'c_lumen', person: 'cp_lumen2', venue: 'c_domaine', type: 'pt_fest', subs: [{ status: 'pret', plan: [1, 8, 4, 18], use: [2, 16, 3, 23, 0, 59], extraPeriods: [['Montage', 1, 8, 2, 14], ['Démontage', 4, 0, 4, 18]], groups: [['Système façade', [['e_kara', 16], ['e_sb18', 8], ['e_cl5', 1], ['e_m4', 6]]], ['Lumière scène', [['e_mega', 12], ['e_aura', 12], ['e_ma3', 1], ['e_hazer', 2]]], ['Structure & énergie', [['e_truss', 24], ['e_moteur', 8], ['e_groupe', 1], ['e_armoire', 3], ['e_p17', 12]]]], crew: [['Régisseur général', 'cr_karim', [1, 8, 4, 18], 50, 32], ['Ingénieur son', 'cr_julien', [2, 10, 3, 23], 48, 30], ['Éclairagiste', 'cr_sophie', [2, 10, 3, 23], 48, 30], ['Rigger', 'cr_lucas', [1, 8, 2, 18], 45, 29], ['Technicien plateau', null, [1, 8, 4, 18], 32, 20, 2]], transport: [['Transport semi-remorque', 'v_semi', [1, 7, 4, 20], 180, 2.4]], costs: [['Hébergement équipe (nuitées)', 8, 95, 80]], insurance: 2 }] })
  project({ key: 'salon', name: 'Salon TechCorp Innovation', client: 'c_techcorp', person: 'cp_tech', venue: 'c_palais', type: 'pt_corp', subs: [{ status: 'confirme', plan: [2, 8, 5, 16], use: [3, 8, 4, 20], groups: [['Mur LED scène', [['e_led', 96], ['e_atem', 1], ['e_moni', 4]]], ['Sonorisation', [['e_e8', 8], ['e_sq6', 1], ['e_ulxd', 8], ['e_case_sm58', 1]]]], crew: [['Technicien vidéo', 'cr_emma', [2, 8, 5, 16], 42, 27], ['Ingénieur son', 'cr_julien', [3, 7, 4, 20], 48, 30], ['Technicien plateau', 'cr_chloe', [2, 8, 2, 18], 32, 20], ['Chauffeur PL', null, [2, 6, 5, 18], 30, 19]], transport: [['Transport porteur 19 T', 'v_19t', [2, 6, 5, 18], 790]] }] })
  project({ key: 'location', name: 'Location sèche — Jazz en Loire', client: 'c_jazz', type: 'pt_loc', subs: [{ status: 'concept', plan: [4, 10, 7, 18], use: [5, 9, 6, 23], groups: [['Matériel retiré par le client', [['e_sm58', 6], ['e_e8', 2], ['e_sq6', 1], ['e_mange', 10]]]] }] })
  project({ key: 'theatre', name: 'Saison théâtre — Création « Les Vagues »', client: 'c_theatre', person: 'cp_theatre', type: 'pt_spec', subs: [{ status: 'confirme', plan: [6, 8, 12, 12], use: [7, 14, 11, 23], groups: [['Son', [['e_kara', 8], ['e_sb18', 4], ['e_cl5', 1], ['e_m4', 4]]], ['Lumière', [['e_s4', 16], ['e_aura', 8], ['e_ma3', 1]]]], crew: [['Éclairagiste', 'cr_sophie', [6, 9, 11, 23], 48, 30], ['Ingénieur son', 'cr_nadia', [6, 9, 11, 23], 48, 30]] }] })
  project({ key: 'concert', name: 'Concert de clôture — Festival des Terrasses', client: 'c_terrasses', person: 'cp_terr', venue: 'c_zenith', type: 'pt_fest', subs: [{ status: 'option', plan: [8, 8, 10, 14], use: [9, 14, 9, 23, 0, 59], groups: [['Façade', [['e_kara', 24], ['e_sb18', 12], ['e_cl5', 1]]], ['Retours', [['e_m4', 10], ['e_sq6', 1], ['e_sm58', 12]]], ['Lumière', [['e_mega', 16], ['e_aura', 16], ['e_ma3', 1]]]], crew: [['Régisseur général', 'cr_karim', [8, 8, 10, 14], 50, 32], ['Ingénieur son', 'cr_julien', [9, 10, 9, 23], 48, 30, 1, { invitation: 'invite' }], ['Ingénieur son retours', null, [9, 10, 9, 23], 48, 30], ['Rigger', 'cr_lucas', [8, 8, 9, 18], 45, 29, 1, { visible: false, invitation: 'invite' }]], transport: [['Transport semi-remorque', 'v_semi', [8, 7, 10, 20], 40, 2.4], ['Transport camion 20 m³', null, [8, 7, 10, 20], 40, 1.2]] }] })
  project({ key: 'pixel', name: 'Lancement produit Studio Pixel', client: 'c_pixel', person: 'cp_pixel', type: 'pt_corp', subs: [{ status: 'demande', plan: [15, 8, 17, 12], use: [16, 18, 16, 23], groups: [['Projection', [['e_vp', 2], ['e_ecran', 2], ['e_e8', 4], ['e_sq6', 1]]]] }] })
  project({
    key: 'tournee',
    name: 'Tournée « Les Ondes » — Automne',
    client: 'c_ondes',
    person: 'cp_ondes',
    type: 'pt_fest',
    subs: [
      { name: 'Rennes — Le Liberté', status: 'confirme', plan: [18, 8, 19, 23], use: [18, 20, 18, 23, 30, 30], groups: [['Backline & son', [['e_e8', 6], ['e_sq6', 1], ['e_sm58', 8], ['e_xlr10', 20]]], ['Lumière', [['e_par', 24], ['e_aura', 6]]]], crew: [['Régisseur général', 'cr_karim', [18, 12, 18, 23], 50, 32], ['Ingénieur son', 'cr_nadia', [18, 14, 18, 23], 48, 30]], transport: [['Transport camion 20 m³', 'v_20', [18, 8, 19, 12], 220, 1.2]] },
      { name: 'Angers — Le Chabada', status: 'confirme', plan: [21, 8, 22, 23], use: [21, 20, 21, 23, 30, 30], groups: [['Backline & son', [['e_e8', 6], ['e_sq6', 1], ['e_sm58', 8], ['e_xlr10', 20]]], ['Lumière', [['e_par', 24], ['e_aura', 6]]]], crew: [['Régisseur général', 'cr_karim', [21, 12, 21, 23], 50, 32], ['Ingénieur son', 'cr_nadia', [21, 14, 21, 23], 48, 30]], transport: [['Transport camion 20 m³', 'v_20', [21, 8, 22, 12], 180, 1.2]] },
      { name: 'Brest — La Carène', status: 'option', plan: [25, 8, 26, 23], use: [25, 20, 25, 23, 30, 30], groups: [['Backline & son', [['e_e8', 6], ['e_sq6', 1], ['e_sm58', 8], ['e_xlr10', 20]]], ['Lumière', [['e_par', 24], ['e_aura', 6]]]], crew: [['Régisseur général', null, [25, 12, 25, 23], 50, 32], ['Ingénieur son', 'cr_nadia', [25, 14, 25, 23], 48, 30]], transport: [['Transport camion 20 m³', null, [25, 6, 26, 14], 600, 1.2]] },
    ],
  })
  project({ key: 'mariage', name: 'Mariage au Domaine de la Loire', client: 'c_pixel', venue: 'c_domaine', type: 'pt_inst', subs: [{ status: 'annule', plan: [20, 8, 22, 14], use: [21, 15, 22, 4], groups: [['Soirée', [['e_par', 24], ['e_e8', 4], ['e_sq6', 1]]]] }] })
  project({ key: 'conference', name: 'Conférence annuelle TechCorp', client: 'c_techcorp', person: 'cp_tech', venue: 'c_palais', type: 'pt_corp', subs: [{ status: 'confirme', plan: [24, 8, 27, 12], use: [25, 8, 26, 19], groups: [['Plénière', [['e_led', 48], ['e_vp', 1], ['e_e8', 12], ['e_cl5', 1], ['e_ulxd', 12]]]], crew: [['Technicien vidéo', 'cr_emma', [24, 8, 26, 20], 42, 27], ['Ingénieur son', 'cr_julien', [25, 7, 26, 19], 48, 30, 1, { invitation: 'invite' }]], transport: [['Transport porteur 19 T', 'v_19t', [24, 7, 27, 12], 790]] }] })

  out.settings.nextProjectNumber = pnum + 1

  // ---------- Disponibilités et congés ----------
  out.crewAvailability.push(
    { id: 'ca_1', crewId: 'cr_sophie', kind: 'conge', startsAt: at(13, 0), endsAt: at(16, 23, 59), title: 'Congés payés', status: 'approuve', note: '' },
    { id: 'ca_2', crewId: 'cr_lucas', kind: 'indisponible', startsAt: at(5, 0), endsAt: at(5, 23, 59), title: 'Formation CACES', status: 'approuve', note: '' },
    { id: 'ca_3', crewId: 'cr_thomas', kind: 'conge', startsAt: at(20, 0), endsAt: at(24, 23, 59), title: 'Vacances', status: 'demande', note: 'Demande envoyée depuis l’application.' },
    { id: 'ca_4', crewId: 'cr_emma', kind: 'disponible', startsAt: at(7, 8), endsAt: at(12, 20), title: 'Disponible', status: 'approuve', note: '' },
    { id: 'ca_5', crewId: 'cr_chloe', kind: 'rendezvous', startsAt: at(3, 9), endsAt: at(3, 12), title: 'Visite technique Zénith', status: 'approuve', note: '' },
  )

  // ---------- Maintenance ----------
  out.repairs.push(
    { id: 'rep_1', number: 'REP-2026-0001', equipmentId: 'e_aura', serialId: null, quantity: 1, title: 'Moteur pan bruyant', description: 'Bruit de frottement sur l’axe pan, à vérifier.', status: 'en_cours', startsAt: at(-5, 9), endsAt: at(6, 18), unavailable: true, cost: 120, reporter: 'Sophie Laurent', repairer: 'Atelier interne', projectId: 'p_spectacle', createdAt: addDays(T, -5).toISOString() },
    { id: 'rep_2', number: 'REP-2026-0002', equipmentId: 'e_ulxd', serialId: null, quantity: 1, title: 'Capsule cassée', description: 'Chute sur scène, capsule remplacée.', status: 'terminee', startsAt: at(-20, 9), endsAt: at(-15, 18), unavailable: true, cost: 85, reporter: 'Julien Moreau', repairer: 'Shure SAV', projectId: null, createdAt: addDays(T, -20).toISOString() },
    { id: 'rep_3', number: 'REP-2026-0003', equipmentId: 'e_vp', serialId: 'sn_vp_3', quantity: 1, title: 'Remplacement du filtre', description: 'Message d’erreur « filtre encrassé ».', status: 'en_cours', startsAt: at(-1, 9), endsAt: at(3, 18), unavailable: true, cost: 60, reporter: 'Emma Petit', repairer: 'Atelier interne', projectId: null, createdAt: addDays(T, -1).toISOString() },
  )
  out.settings.nextRepairNumber = 4
  out.inspections.push(
    { id: 'ins_1', equipmentId: 'e_moteur', serialId: null, name: 'Vérification générale périodique (VGP) levage', intervalMonths: 12, lastDate: day(-340), nextDate: day(25), result: 'a_faire', notes: 'Organisme agréé à contacter.' },
    { id: 'ins_2', equipmentId: 'e_armoire', serialId: null, name: 'Vérification électrique', intervalMonths: 12, lastDate: day(-100), nextDate: day(265), result: 'ok', notes: '' },
    { id: 'ins_3', equipmentId: 'e_groupe', serialId: 'sn_ge_1', name: 'Entretien moteur 250 h', intervalMonths: 6, lastDate: day(-200), nextDate: day(-5), result: 'a_faire', notes: 'Vidange + filtres.' },
  )

  // ---------- Sous-location et bon de commande ----------
  out.subrents.push({ id: 'sr_1', number: 'SL-2026-0001', supplierId: 'c_ouest', projectId: 'p_concert', status: 'confirme', startsAt: at(8, 8), endsAt: at(10, 14), lines: [{ equipmentId: 'e_kara', quantity: 8, price: 60 }], cost: 480, notes: 'Livraison directe au Zénith.', createdAt: addDays(T, -2).toISOString(), updatedBy: I })
  out.purchaseOrders.push({ id: 'po_1', number: 'BC-2026-0001', supplierId: 'c_ouest', projectId: 'p_concert', subrentId: 'sr_1', date: day(-2), status: 'envoye', lines: [{ label: 'Sous-location 8 × L-Acoustics Kara II', quantity: 1, price: 480 }], total: 480, notes: '', updatedBy: I })
  out.settings.nextSubrentNumber = 2
  out.settings.nextPoNumber = 2

  // ---------- Demandes de projets ----------
  out.requests.push(
    { id: 'rq_1', receivedAt: addDays(T, -1).toISOString(), contactName: 'Clara Dubreuil', company: null, email: 'clara.dubreuil@mail.fr', phone: '06 77 88 99 00', eventName: 'Mariage Clara & Hugo', startsAt: at(40, 16), endsAt: at(41, 4), venue: 'Château de la Frémoire, Vertou', message: 'Bonjour, nous cherchons une sonorisation et des éclairages d’ambiance pour 120 invités. Merci !', items: [{ equipmentId: 'e_par', quantity: 20 }, { equipmentId: 'e_e8', quantity: 4 }, { equipmentId: 'e_sq6', quantity: 1 }, { equipmentId: 'e_mange', quantity: 10 }], status: 'nouvelle', projectId: null },
    { id: 'rq_2', receivedAt: addDays(T, -3).toISOString(), contactName: 'Service communication', company: 'Banque Atlantique', email: 'communication@banque-atlantique.fr', phone: '02 40 12 12 12', eventName: 'Séminaire de direction 2027', startsAt: at(60, 8), endsAt: at(60, 18), venue: 'Siège social, Nantes', message: 'Besoin d’une projection et de micros HF pour 60 personnes.', items: [{ equipmentId: 'e_vp', quantity: 1 }, { equipmentId: 'e_ecran', quantity: 1 }, { equipmentId: 'e_ulxd', quantity: 4 }], status: 'nouvelle', projectId: null },
  )

  // ---------- Tâches et notes ----------
  const task = (tid, projectId, title, status, priority, d, assignees, extra = {}) => ({ id: tid, projectId, title, details: '', status, priority, deadline: d == null ? null : at(d, 18), assignees, timeBudgetMin: 0, trackedMin: 0, subtasks: [], tags: [], color: null, sort: 0, createdBy: 'Karim Benali', createdAt: addDays(T, -4).toISOString(), updatedBy: I, ...extra })
  out.tasks.push(
    task('tk_1', 'p_electro', 'Valider le plan de feu avec la production', 'en_cours', 'haute', 0, ['cr_sophie'], { timeBudgetMin: 120, trackedMin: 45, tags: ['lumière'] }),
    task('tk_2', 'p_electro', 'Réserver l’hébergement de l’équipe', 'termine', 'normale', -3, ['cr_karim']),
    task('tk_3', 'p_electro', 'Envoyer la feuille d’appel', 'a_faire', 'normale', 1, ['cr_karim'], { subtasks: [{ id: 'st1', title: 'Horaires équipe', done: true }, { id: 'st2', title: 'Plan d’accès', done: false }] }),
    task('tk_4', 'p_concert', 'Relancer le client pour la confirmation du devis', 'a_faire', 'haute', 2, ['cr_karim']),
    task('tk_5', 'p_concert', 'Résoudre la pénurie de SB18 (sous-location)', 'a_faire', 'haute', 5, ['cr_julien'], { tags: ['pénurie'] }),
    task('tk_6', 'p_salon', 'Récupérer les badges d’accès au Palais des Congrès', 'a_faire', 'normale', 1, ['cr_emma']),
    task('tk_7', null, 'Contrôle annuel des moteurs de levage', 'a_faire', 'normale', 10, ['cr_lucas'], { tags: ['maintenance'] }),
    task('tk_8', null, 'Inventaire du câblage XLR', 'en_cours', 'basse', 14, ['cr_chloe'], { timeBudgetMin: 240, trackedMin: 90 }),
  )
  out.notes.push(
    { id: 'nt_1', projectId: 'p_gala', subprojectId: null, scope: 'interne', text: 'Le client souhaite une ambiance chaude (ambre) pendant le cocktail.', author: 'Karim Benali', createdAt: addDays(T, -6).toISOString() },
    { id: 'nt_2', projectId: 'p_electro', subprojectId: 'p_electro_sp1', scope: 'entrepot', text: 'Vérifier les moteurs de levage avant le départ (contrôle annuel à jour).', author: 'Karim Benali', createdAt: T.toISOString() },
    { id: 'nt_3', projectId: 'p_concert', subprojectId: null, scope: 'externe', text: 'Merci de prévoir un accès poids lourd à 7 h le jour du montage.', author: 'Administrateur', createdAt: addDays(T, -2).toISOString() },
  )

  // ---------- Heures enregistrées (projets passés et en cours) ----------
  for (const a of out.assignments) {
    if (!a.crewId) continue
    const f = out.functions.find((x) => x.id === a.functionId)
    const sub = out.subprojects.find((s) => s.id === a.subprojectId)
    if (!f || !['retourne', 'sur_site'].includes(sub.status) || new Date(f.planStart) > new Date()) continue
    // Une journée de travail par jour couvert (la dernière peut finir après minuit), seulement les journées terminées
    const s0 = new Date(f.planStart)
    const e0 = new Date(f.planEnd)
    const shifts = []
    if (e0 - s0 <= 16 * 3600000) shifts.push([s0, e0])
    else
      for (let d = startOfDay(s0); d < e0; d = addDays(d, 1)) {
        const s = d.getTime() === startOfDay(s0).getTime() ? s0 : new Date(d.getFullYear(), d.getMonth(), d.getDate(), s0.getHours(), s0.getMinutes())
        if (s >= e0) break
        const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, s0.getHours(), s0.getMinutes())
        shifts.push([s, next >= e0 ? e0 : new Date(s.getTime() + 10 * 3600000)])
      }
    for (const [s, e] of shifts) {
      if (e > new Date()) continue
      out.timeEntries.push({ id: id('te'), crewId: a.crewId, projectId: a.projectId, functionId: f.id, kind: 'travail', startsAt: toLocalInput(s), endsAt: toLocalInput(e), breakMinutes: 30, travelMinutes: 20, activity: f.name, status: sub.status === 'retourne' ? 'approuve' : 'soumis', notes: '', createdAt: new Date().toISOString() })
    }
  }

  // ---------- Documents ----------
  const mkDoc = (key, type, status, dOffset, extra = {}) => {
    const d = addDays(T, dOffset)
    const s = out.settings
    const [prefixKey, counterKey] = DOC_SERIES[type]
    const doc = buildDocument(`p_${key}`, type, out, {
      status,
      date: toDateInput(d),
      dueDate: toDateInput(addDays(d, type === 'facture' ? s.paymentTermDays : s.quoteValidityDays)),
      number: `${s[prefixKey]}${d.getFullYear()}-${String(s[counterKey]).padStart(4, '0')}`,
      createdAt: d.toISOString(),
      ...extra,
    })
    s[counterKey] += 1
    if (status === 'payee') doc.payments = [{ date: toDateInput(addDays(d, 20)), amount: Math.round(doc.totals.total * (extra.partialPct ? extra.partialPct / 100 : 1) * 100) / 100, method: 'Virement' }]
    out.documents.push(doc)
  }
  for (const k of Object.keys(PAST_DAYS)) {
    mkDoc(k, 'devis', 'accepte', PAST_DAYS[k] - 25)
    mkDoc(k, 'facture', 'payee', PAST_DAYS[k] + 3)
  }
  mkDoc('printemps', 'devis', 'accepte', -70)
  mkDoc('printemps', 'facture', 'payee', -42)
  mkDoc('spectacle', 'devis', 'accepte', -50)
  mkDoc('spectacle', 'facture', 'envoye', -40)
  mkDoc('automne', 'devis', 'accepte', -30)
  mkDoc('automne', 'facture', 'envoye', -9)
  mkDoc('gala', 'devis', 'accepte', -20)
  mkDoc('gala', 'facture', 'payee', -18, { partialPct: 30, notes: 'Facture d’acompte (30 %).' })
  mkDoc('theatre', 'contrat', 'accepte', -12)
  mkDoc('salon', 'devis', 'accepte', -15)
  mkDoc('tournee', 'devis', 'accepte', -25)
  mkDoc('concert', 'devis', 'envoye', -3)
  mkDoc('conference', 'devis', 'brouillon', 0)
  for (const doc of out.documents) doc.updatedBy = I

  return out
}
