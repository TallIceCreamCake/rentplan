#!/usr/bin/env bash
# Installation macOS de RentPlan (appelé par install.sh à la racine du dépôt) :
# prérequis via Homebrew (Node.js, git, Docker Desktop), préparation de l'application
# et agent launchd qui démarre à l'ouverture de la session.
#
#   bash install.sh [--port 9000]      installer / réinstaller
#   bash install.sh --uninstall        retirer le service (fichiers et base conservés)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL="com.rentplan.agent"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"

say()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -ne 0 ]] || die "Lancez l'installation sans sudo : RentPlan tourne sous votre compte."

stop_agent() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
}

SETUP_ARGS=()
[[ -n "${RENTPLAN_REPO:-}" ]] && SETUP_ARGS+=(--repository "$RENTPLAN_REPO")
[[ -n "${RENTPLAN_BRANCH:-}" ]] && SETUP_ARGS+=(--branch "$RENTPLAN_BRANCH")
while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall)
      stop_agent
      rm -f "$PLIST"
      echo "Service RentPlan retiré. Les fichiers de ${APP_DIR} et la base Supabase sont conservés."
      exit 0 ;;
    --port) SETUP_ARGS+=(--port "${2:?valeur manquante pour --port}"); shift ;;
    *) die "Option inconnue : $1" ;;
  esac
  shift
done

say "Prérequis"
BREW="$(command -v brew || ls /opt/homebrew/bin/brew /usr/local/bin/brew 2>/dev/null | head -1 || true)"
need_brew() {
  [[ -n "$BREW" ]] || die "$1 est absent. Installez Homebrew (https://brew.sh) puis relancez, ou installez $1 vous-même ($2)."
}
node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" || "$(node_major "$NODE_BIN")" -lt 20 ]]; then
  need_brew "Node.js 20+" "https://nodejs.org"
  echo "  Installation de Node.js…"
  NONINTERACTIVE=1 "$BREW" install node >/dev/null
  NODE_BIN="$("$BREW" --prefix)/bin/node"
fi
if ! git --version >/dev/null 2>&1; then
  need_brew "git" "xcode-select --install"
  echo "  Installation de git…"
  NONINTERACTIVE=1 "$BREW" install git >/dev/null
fi
if ! command -v docker >/dev/null && [[ ! -d /Applications/Docker.app ]]; then
  if [[ -n "$BREW" ]]; then
    echo "  Installation de Docker Desktop…"
    NONINTERACTIVE=1 "$BREW" install --cask docker >/dev/null || warn "Installation de Docker Desktop impossible : https://www.docker.com/products/docker-desktop/"
  else
    warn "Docker Desktop est absent : la base ne pourra pas démarrer. https://www.docker.com/products/docker-desktop/"
  fi
fi
# Docker Desktop doit tourner pour la base ; RentPlan réessaie tout seul tant qu'il n'est pas prêt
[[ -d /Applications/Docker.app ]] && open -g -a Docker 2>/dev/null || true
echo "  node $("$NODE_BIN" -v) · $(git --version)"

stop_agent

say "Préparation de l'application"
"$NODE_BIN" "$APP_DIR/deploy/agent.mjs" setup "${SETUP_ARGS[@]+"${SETUP_ARGS[@]}"}"

say "Service (launchd)"
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
mkdir -p "$(dirname "$PLIST")" "$APP_DIR/.rentplan/logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$NODE_BIN")</string>
    <string>$(xml "$APP_DIR/deploy/start.mjs")</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml "$APP_DIR")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(xml "$(dirname "$NODE_BIN")"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>$(xml "$APP_DIR/.rentplan/logs/launchd-errors.log")</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null || die "Fichier de service invalide : $PLIST"
launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"

PORT="$("$NODE_BIN" -p 'require(process.argv[1]).port' "$APP_DIR/deploy/config.json")"

cat <<EOF

✓ RentPlan est installé et démarre à l'ouverture de votre session.
  Ouvrez http://localhost:${PORT}
  puis créez le compte administrateur : un assistant vous guide pour le reste.
  Docker Desktop doit être lancé (Réglages › Général › « Start Docker Desktop when you sign in »).

  Mises à jour  : automatiques depuis GitHub
  Journal       : ${APP_DIR}/.rentplan/logs/agent.log
  Désinstaller  : bash "${APP_DIR}/install.sh" --uninstall
EOF
