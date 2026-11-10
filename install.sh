#!/usr/bin/env bash
# Installation de RentPlan sur Linux ou macOS, en une commande :
#
#   curl -fsSL https://raw.githubusercontent.com/TallIceCreamCake/rentplan/main/install.sh | bash
#
# Options (avec curl : « | bash -s -- --port 9000 ») :
#   --dir <dossier>   dossier d'installation (défaut : ~/rentplan)
#   --port <port>     port de l'application (défaut : 8080)
#   --uninstall       retirer le service (les fichiers et la base sont conservés)
#
# Le script télécharge RentPlan, installe ce qui manque (git, Node.js, Docker), prépare l'application
# puis l'enregistre comme service (systemd sous Linux, launchd sous macOS). Il peut être relancé sans risque.
set -euo pipefail

# Tout est dans main() : avec « curl | bash », le script est lu en entier avant de s'exécuter
main() {
  local repo="${RENTPLAN_REPO:-https://github.com/TallIceCreamCake/rentplan}"
  local branch="${RENTPLAN_BRANCH:-main}"
  local dir="${RENTPLAN_DIR:-$HOME/rentplan}"
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dir) dir="${2:?valeur manquante pour --dir}"; shift 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done

  local os
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=macos ;;
    *) echo "Système non pris en charge : $(uname -s). Sous Windows, utilisez install.ps1." >&2; exit 1 ;;
  esac

  # Lancé depuis un dossier RentPlan (git clone ou archive décompressée) : on l'installe tel quel
  local src="${BASH_SOURCE[0]:-}"
  if [[ -n "$src" && -f "$src" && -f "$(dirname "$src")/deploy/agent.mjs" ]]; then
    dir="$(cd "$(dirname "$src")" && pwd)"
  elif [[ -f "$dir/deploy/agent.mjs" ]]; then
    echo "▸ RentPlan est déjà présent dans $dir : réinstallation."
  else
    [[ ! -e "$dir" || -z "$(ls -A "$dir" 2>/dev/null)" ]] || { echo "Le dossier $dir existe déjà et n'est pas vide : choisissez-en un autre avec --dir." >&2; exit 1; }
    echo "▸ Téléchargement de RentPlan dans $dir"
    if command -v git >/dev/null 2>&1; then
      git clone --quiet --branch "$branch" "${repo%.git}.git" "$dir"
    else
      # Sans git : archive du dépôt ; l'installation la reliera ensuite à GitHub
      mkdir -p "$dir"
      curl -fsSL "${repo%.git}/archive/refs/heads/${branch}.tar.gz" | tar -xz --strip-components=1 -C "$dir"
    fi
  fi

  exec bash "$dir/deploy/$os/install.sh" "${args[@]+"${args[@]}"}" </dev/null
}

main "$@"
