# RentPlan

Application de gestion de location de matériel événementiel (inspirée de Rentman) : projets, matériel et numéros de série, entrepôt (préparation / retour), équipe et planning, véhicules, contacts, devis/factures, signature de documents, statistiques.

**Stack** : React 19 + Vite, Zustand, React Router, Supabase (Postgres, Auth, Realtime).

## Démarrage

Prérequis : Node.js 20+, Docker (pour Supabase en local).

```bash
npm install
cp .env.example .env.local   # valeurs par défaut du Supabase local
npm run db:start             # lance Supabase (ports 545xx) et applique les migrations
npm run dev                  # http://localhost:5173
```

Sans variables `VITE_SUPABASE_*`, l'application fonctionne en mode stockage local (navigateur).

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Prévisualise le build |
| `npm run db:start` / `db:stop` | Démarre / arrête Supabase local |
| `npm run db:reset` | Recrée la base et rejoue les migrations |
| `npm run db:status` | URLs et clés du Supabase local |

## Structure

```
src/
  pages/        écrans (Projets, Matériel, Entrepôt, Équipe, Finance…)
  components/   composants partagés (UI, calendriers, documents…)
  lib/          accès base, modèle, permissions, documents, utilitaires
supabase/
  migrations/   schéma SQL versionné
  config.toml   configuration du Supabase local
```
