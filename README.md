# RentPlan

Application de gestion de location de matériel événementiel (inspirée de Rentman) : projets, matériel et numéros de série, entrepôt (préparation / retour), équipe et planning, véhicules, contacts, devis/factures, signature de documents, statistiques.

## Installation

Une seule commande par système. Elle télécharge RentPlan, installe ce qui manque (Node.js, Git, Docker), prépare l'application et l'enregistre comme service qui démarre tout seul. RentPlan est ensuite disponible sur **http://localhost:8080** et **se met à jour automatiquement** depuis ce dépôt GitHub.

### Windows

Dans **PowerShell** :

```powershell
irm https://raw.githubusercontent.com/TallIceCreamCake/rentplan/main/install.ps1 | iex
```

- Installé dans `%USERPROFILE%\RentPlan`. Les droits administrateur sont demandés une fois.
- Node.js, Git et Docker Desktop sont installés avec winget s'ils sont absents. Si Docker Desktop vient d'être installé, redémarrez Windows puis ouvrez-le une fois pour accepter ses conditions.
- RentPlan démarre avec Windows (tâche planifiée « RentPlan »).
- Désinstaller : `powershell -ExecutionPolicy Bypass -File "$HOME\RentPlan\install.ps1" -Uninstall`

### Linux

```bash
curl -fsSL https://raw.githubusercontent.com/TallIceCreamCake/rentplan/main/install.sh | bash
```

- Installé dans `~/rentplan`. Le mot de passe `sudo` est demandé une fois.
- git, Node.js 22 et Docker sont installés s'ils sont absents (Debian, Ubuntu, Fedora, RHEL, Arch…).
- RentPlan démarre avec la machine (service systemd `rentplan`).
- Désinstaller : `bash ~/rentplan/install.sh --uninstall`

### macOS

```bash
curl -fsSL https://raw.githubusercontent.com/TallIceCreamCake/rentplan/main/install.sh | bash
```

- Installé dans `~/rentplan`, sans `sudo`.
- Node.js, git et Docker Desktop sont installés avec [Homebrew](https://brew.sh) s'ils sont absents.
- RentPlan démarre à l'ouverture de la session (agent launchd). Docker Desktop doit aussi démarrer avec la session : Réglages › Général › « Start Docker Desktop when you sign in ».
- Désinstaller : `bash ~/rentplan/install.sh --uninstall`

### Options

| | Windows | Linux / macOS |
| --- | --- | --- |
| Autre port | `& ([scriptblock]::Create((irm https://raw.githubusercontent.com/TallIceCreamCake/rentplan/main/install.ps1))) -Port 9000` | `curl -fsSL https://raw.githubusercontent.com/TallIceCreamCake/rentplan/main/install.sh \| bash -s -- --port 9000` |
| Autre dossier | `… -Dir D:\RentPlan` | `… \| bash -s -- --dir /srv/rentplan` |

Relancer la commande d'installation répare ou met à jour une installation existante. On peut aussi télécharger le dépôt (git clone ou ZIP), le placer où l'on veut et lancer `install.ps1` ou `install.sh` depuis ce dossier.

## Première configuration

1. Ouvrez **http://localhost:8080** et créez le **compte administrateur**.
2. Un assistant vous guide ensuite en quelques étapes :
   - **Entreprise** : raison sociale, coordonnées, SIRET, TVA, logo ;
   - **Facturation** : devise, TVA, délais, coordonnées bancaires, numérotation (pour reprendre une série existante) ;
   - **Entrepôt** : nom et adresse de l'emplacement de stock principal ;
   - **Modules** : devis et factures, enregistrement horaire, demandes de location, maintenance.
3. Invitez votre équipe dans **Configuration › Utilisateurs**. Un collaborateur peut aussi créer son compte depuis l'écran de connexion, puis un administrateur l'active.

Tout reste modifiable ensuite dans **Configuration**.

## Mises à jour automatiques

- Toutes les 5 minutes, RentPlan vérifie la branche `main` sur GitHub. Pour une nouvelle version, il récupère le code, met à jour les dépendances, compile, applique les nouvelles migrations de la base, puis bascule sans interruption.
- Si une version ne s'installe pas (compilation ou migration en erreur), la version précédente reste en service et un nouvel essai a lieu plus tard.
- Si des fichiers ont été modifiés à la main sur la machine, la mise à jour est suspendue et rien n'est écrasé.
- Dans le navigateur, un bandeau annonce la nouvelle version ; elle s'applique au changement de page suivant, une fois les enregistrements en cours terminés.
- **Configuration › Sauvegardes › Mises à jour** affiche la version en service et permet de lancer une recherche immédiate.

### Réglages et suivi

`deploy/config.json`, créé à l'installation et propre à chaque machine :

| Clé | Défaut | Rôle |
| --- | --- | --- |
| `port` / `host` | `8080` / `0.0.0.0` | Adresse du serveur web |
| `branch` | `main` | Branche suivie |
| `checkIntervalMinutes` | `5` | Fréquence de vérification |
| `manageSupabase` | `true` | Démarrer la base (Supabase) et appliquer les migrations |
| `githubToken` | vide | Jeton GitHub, uniquement si le dépôt devient privé |

Après une modification, redémarrez le service (ou la machine).

| Commande (dans le dossier d'installation) | Rôle |
| --- | --- |
| `npm run deploy:status` | Version en ligne, dernière vérification, dernière erreur |
| `npm run deploy:update` | Vérifier GitHub immédiatement |

Journal : `.rentplan/logs/agent.log` dans le dossier d'installation (et `journalctl -u rentplan -f` sous Linux).

## Développement

**Stack** : React 19 + Vite, Zustand, React Router, Supabase (Postgres, Auth, Realtime). Prérequis : Node.js 20+ et Docker.

```bash
npm install
cp .env.example .env.local   # valeurs par défaut du Supabase local
npm run db:start             # lance Supabase (ports 545xx) et applique les migrations
npm run dev                  # http://localhost:5173
```

Sans variables `VITE_SUPABASE_*`, l'application fonctionne en mode stockage local (navigateur), avec des données de démonstration.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Prévisualise le build |
| `npm run db:start` / `db:stop` | Démarre / arrête Supabase local |
| `npm run db:reset` | Recrée la base et rejoue les migrations |
| `npm run db:status` | URLs et clés du Supabase local |
| `npm start` | Lance le serveur avec mises à jour automatiques, sans l'installer comme service |

```
install.sh / install.ps1   installation en une commande (Linux, macOS / Windows)
deploy/
  agent.mjs     serveur web + mises à jour automatiques
  start.mjs     superviseur (relance l'agent)
  linux/ macos/ windows/   installation du service par système
src/
  pages/        écrans (Projets, Matériel, Entrepôt, Équipe, Finance…)
  components/   composants partagés (UI, calendriers, documents…)
  lib/          accès base, modèle, permissions, documents, utilitaires
supabase/
  migrations/   schéma SQL versionné
  config.toml   configuration du Supabase local
```
