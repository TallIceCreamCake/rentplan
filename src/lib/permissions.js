// Droits d'accès : modules de la barre latérale, niveaux et correspondance avec les données.
// La même logique est appliquée côté base (supabase/migrations/20261028100000_comptes_roles.sql).

export const MODULES = [
  { id: 'dashboard', label: 'Tableau de bord', icon: 'dashboard', path: '/' },
  { id: 'agenda', label: 'Mon agenda', icon: 'event', path: '/agenda' },
  { id: 'entrepot', label: 'Entrepôt', icon: 'warehouse', path: '/entrepot' },
  { id: 'projets', label: 'Projets', icon: 'table_chart', path: '/projets' },
  { id: 'planificateur', label: 'Planificateur d’équipes', icon: 'account_circle', path: '/planificateur' },
  { id: 'penuries', label: 'Pénuries', icon: 'swap_horizontal_circle', path: '/penuries' },
  { id: 'finances', label: 'Finances', icon: 'monetization_on', path: '/finances' },
  { id: 'equipements', label: 'Équipements', icon: 'category', path: '/equipements' },
  { id: 'contacts', label: 'Contacts', icon: 'contact_phone', path: '/contacts' },
  { id: 'personnel', label: 'Membres du personnel', icon: 'people', path: '/personnel' },
  { id: 'vehicules', label: 'Véhicules', icon: 'local_shipping', path: '/vehicules' },
  { id: 'taches', label: 'Tâches', icon: 'assignment_turned_in', path: '/taches' },
  { id: 'heures', label: 'Enregistrement horaire', icon: 'watch_later', path: '/heures' },
  { id: 'maintenance', label: 'Maintenance', icon: 'build', path: '/maintenance' },
  { id: 'statistiques', label: 'Statistiques', icon: 'insert_chart', path: '/statistiques' },
  { id: 'demandes', label: 'Demandes de location', icon: 'move_to_inbox', path: '/demandes' },
  { id: 'configuration', label: 'Configuration', icon: 'settings', path: '/configuration' },
]
export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]))

export const LEVELS = [
  { id: 'aucun', label: 'Aucun accès' },
  { id: 'lecture', label: 'Lecture' },
  { id: 'modification', label: 'Modification' },
]
const RANK = { aucun: 0, lecture: 1, modification: 2 }

/** Module dont dépend chaque route (premier segment de l'URL). */
const ROUTE_MODULES = {
  '': 'dashboard',
  agenda: 'agenda',
  entrepot: 'entrepot',
  projets: 'projets',
  planificateur: 'planificateur',
  penuries: 'penuries',
  finances: 'finances',
  documents: 'finances',
  equipements: 'equipements',
  contacts: 'contacts',
  personnel: 'personnel',
  vehicules: 'vehicules',
  taches: 'taches',
  heures: 'heures',
  maintenance: 'maintenance',
  statistiques: 'statistiques',
  demandes: 'demandes',
  configuration: 'configuration',
  editeur: 'configuration',
  signer: 'finances',
}
export const moduleOfPath = (pathname) => ROUTE_MODULES[pathname.split('/')[1] || ''] ?? null

/** Modules qui autorisent l'écriture de chaque collection (un seul suffit). */
export const COLLECTION_MODULES = {
  categories: ['equipements'],
  stockLocations: ['equipements', 'configuration'],
  projectTypes: ['configuration'],
  defaultFunctions: ['configuration'],
  defaultCosts: ['configuration'],
  contacts: ['contacts', 'demandes'],
  contactPersons: ['contacts'],
  crew: ['personnel'],
  crewAvailability: ['personnel', 'heures'],
  vehicles: ['vehicules'],
  equipment: ['equipements'],
  serials: ['equipements'],
  repairs: ['maintenance', 'equipements'],
  inspections: ['maintenance', 'equipements'],
  projects: ['projets', 'demandes'],
  subprojects: ['projets', 'demandes', 'entrepot'],
  periods: ['projets', 'demandes'],
  equipmentGroups: ['projets', 'demandes'],
  plannedEquipment: ['projets', 'demandes', 'penuries'],
  bookings: ['entrepot', 'projets'],
  functionGroups: ['projets'],
  functions: ['projets', 'planificateur'],
  assignments: ['projets', 'planificateur'],
  costs: ['projets'],
  returnCharges: ['entrepot', 'projets'],
  notes: ['projets', 'entrepot'],
  tasks: ['taches', 'projets'],
  documents: ['finances', 'projets'],
  subrents: ['penuries', 'projets'],
  purchaseOrders: ['finances', 'projets', 'penuries'],
  timeEntries: ['heures'],
  requests: ['demandes'],
  files: ['projets', 'equipements'],
}

/** Modules optionnels (Configuration › Extensions) : désactivés pour tout l'espace de travail. */
export const OPTIONAL_MODULES = ['finances', 'heures', 'demandes', 'maintenance']
export const moduleEnabled = (settings, id) => !OPTIONAL_MODULES.includes(id) || settings?.extensions?.[id] !== false

const all = (level) => Object.fromEntries(MODULES.map((m) => [m.id, level]))

/** Rôles par défaut (identiques à ceux créés par la migration ; utilisés aussi en mode local). */
export const ROLE_PRESETS = [
  { id: 'poweruser', name: 'PowerUser', isSystem: true, sort: 0, permissions: { finances: true, manageUsers: true, modules: all('modification') } },
  { id: 'bureau', name: 'Bureau', isSystem: false, sort: 1, permissions: { finances: true, manageUsers: false, modules: { ...all('modification'), statistiques: 'lecture', configuration: 'lecture' } } },
  { id: 'entrepot', name: 'Entrepôt', isSystem: false, sort: 2, permissions: { finances: false, manageUsers: false, modules: { dashboard: 'modification', agenda: 'lecture', entrepot: 'modification', projets: 'lecture', penuries: 'lecture', equipements: 'modification', contacts: 'lecture', vehicules: 'lecture', taches: 'modification', heures: 'modification', maintenance: 'modification' } } },
  { id: 'freelance', name: 'Freelance', isSystem: false, sort: 3, permissions: { finances: false, manageUsers: false, modules: { dashboard: 'modification', agenda: 'lecture', taches: 'modification', heures: 'modification' } } },
  { id: 'defaut', name: 'Utilisateur par défaut', isSystem: true, sort: 4, permissions: { finances: false, manageUsers: false, modules: { dashboard: 'modification', agenda: 'lecture' } } },
]

/**
 * Construit les fonctions d'autorisation d'un rôle.
 * can(module, 'lecture' | 'modification'), finances, admin, canEditCollection(collection).
 */
export function makeAccess(role, profile) {
  const perms = role?.permissions || {}
  const modules = perms.modules || {}
  const level = (m) => modules[m] || 'aucun'
  const can = (m, wanted = 'lecture') => RANK[level(m)] >= RANK[wanted]
  return {
    roleName: role?.name || '—',
    level,
    can,
    finances: Boolean(perms.finances),
    admin: Boolean(perms.manageUsers),
    crewId: profile?.crewId || null,
    canEditCollection: (c) => (COLLECTION_MODULES[c] || ['configuration']).some((m) => can(m, 'modification')),
    /** Première page accessible (si le tableau de bord ne l'est pas). */
    home: () => MODULES.find((m) => m.id !== 'configuration' && can(m.id))?.path || '/configuration?s=profil',
  }
}
