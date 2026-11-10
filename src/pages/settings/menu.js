// Menu de la configuration : mêmes rubriques que Rentman (Compte, Paramètres, Communication client, Finance).
// need : « tous » (chaque compte), « admin » (gérer les comptes) ou « config » (module Configuration).
export const CONFIG_MENU = [
  {
    title: 'Compte',
    items: [
      ['profil', 'Mon profil', 'tous'],
      ['entreprise', 'Détails de l’entreprise'],
      ['paiement', 'Information de paiement'],
      ['mes-factures', 'Mes factures'],
      ['roles', 'Rôles utilisateur', 'admin'],
      ['utilisateurs', 'Utilisateurs', 'admin'],
      ['extensions', 'Extensions'],
      ['donnees', 'Sauvegardes'],
    ],
  },
  {
    title: 'Paramètres',
    items: [
      ['heure-lieu', 'Heure et lieu'],
      ['series', 'Séries de numéros'],
      ['types', 'Types de projets'],
      ['modeles-projets', 'Modèles de projets'],
      ['inspections', 'Inspections périodiques'],
      ['heures', 'Enregistrement horaire'],
      ['statuts-entrepot', 'Statuts d’entrepôt'],
      ['champs', 'Champs de saisie supplémentaires'],
      ['fonctions', 'Fonctions par défaut'],
      ['couts', 'Coûts supplémentaires par défaut'],
      ['dossiers', 'Dossiers d’équipements'],
      ['competences', 'Compétences du personnel'],
    ],
  },
  {
    title: 'Communication client',
    items: [
      ['communication', 'Communication'],
      ['modeles-documents', 'Modèles de documents'],
      ['entete', 'En-tête documents'],
      ['formule', 'Formule d’appel'],
    ],
  },
  {
    title: 'Finance',
    items: [
      ['finance', 'Finance'],
      ['facturation-numerique', 'Facturation numérique'],
      ['tva', 'Régimes de TVA'],
      ['conditions-paiement', 'Conditions de paiement'],
      ['coefficients', 'Groupes de coefficients'],
      ['conditions', 'Conditions supplémentaires'],
    ],
  },
].map((g) => ({ ...g, items: g.items.map(([id, label, need = 'config']) => ({ id, label, need })) }))

/** Rubriques visibles pour un compte. */
export const configMenuFor = (access) =>
  CONFIG_MENU.map((g) => ({ ...g, items: g.items.filter((i) => i.need === 'tous' || (i.need === 'admin' ? access.admin : access.can('configuration'))) })).filter((g) => g.items.length)

export const sectionOf = (id) => CONFIG_MENU.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title }))).find((i) => i.id === id)

/** Rubrique ouverte par défaut. */
export const defaultSection = (access) => (access.can('configuration') ? 'entreprise' : 'profil')
