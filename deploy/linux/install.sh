#!/usr/bin/env bash
# Installation Linux de RentPlan (appelé par install.sh à la racine du dépôt) :
# prérequis (git, Node.js 22, Docker), préparation de l'application et service systemd « rentplan ».
#
#   bash install.sh [--port 9000]      installer / réinstaller
#   bash install.sh --uninstall        retirer le service (fichiers et base conservés)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE="rentplan"
UNIT="/etc/systemd/system/${SERVICE}.service"

say()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Droits administrateur : demandés une seule fois, le service tournera sous le compte qui lance l'installation
if [[ $EUID -ne 0 ]]; then
  command -v sudo >/dev/null || die "sudo est requis (ou lancez ce script en root)."
  echo "Droits administrateur nécessaires pour installer les prérequis et le service."
  exec sudo -E bash "$0" "$@"
fi
RUN_USER="${SUDO_USER:-root}"

SETUP_ARGS=()
[[ -n "${RENTPLAN_REPO:-}" ]] && SETUP_ARGS+=(--repository "$RENTPLAN_REPO")
[[ -n "${RENTPLAN_BRANCH:-}" ]] && SETUP_ARGS+=(--branch "$RENTPLAN_BRANCH")
while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall)
      systemctl disable --now "$SERVICE" 2>/dev/null || true
      rm -f "$UNIT"
      systemctl daemon-reload
      echo "Service ${SERVICE} retiré. Les fichiers de ${APP_DIR} et la base Supabase sont conservés."
      exit 0 ;;
    --port) SETUP_ARGS+=(--port "${2:?valeur manquante pour --port}"); shift ;;
    *) die "Option inconnue : $1" ;;
  esac
  shift
done

command -v systemctl >/dev/null || die "systemd est requis."
[[ "$RUN_USER" != "root" ]] || warn "Le service tournera en root. Préférez lancer l'installation depuis un compte utilisateur."

pkg_install() {
  if command -v apt-get >/dev/null; then apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@"
  elif command -v dnf >/dev/null; then dnf install -y -q "$@"
  elif command -v yum >/dev/null; then yum install -y -q "$@"
  elif command -v pacman >/dev/null; then pacman -Sy --noconfirm --needed "$@"
  elif command -v zypper >/dev/null; then zypper -n -q install "$@"
  else die "Gestionnaire de paquets non reconnu : installez $* puis relancez."
  fi
}

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

say "Prérequis"
command -v curl >/dev/null || pkg_install curl ca-certificates
command -v git >/dev/null || { echo "  Installation de git…"; pkg_install git; }

# Node.js : celui du compte (nvm…) s'il est assez récent, sinon Node 22 pour tout le système
NODE_BIN="$(sudo -u "$RUN_USER" -H bash -lc 'command -v node' 2>/dev/null || true)"
[[ -n "$NODE_BIN" ]] || NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" || "$(node_major "$NODE_BIN")" -lt 20 ]]; then
  echo "  Installation de Node.js 22…"
  if command -v apt-get >/dev/null; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null && apt-get install -y -qq nodejs
  elif command -v dnf >/dev/null || command -v yum >/dev/null; then curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null && { dnf install -y -q nodejs 2>/dev/null || yum install -y -q nodejs; }
  elif command -v pacman >/dev/null; then pacman -Sy --noconfirm --needed nodejs npm
  else die "Installez Node.js 20 ou plus (https://nodejs.org) puis relancez."
  fi
  NODE_BIN="$(command -v node)"
  [[ "$(node_major "$NODE_BIN")" -ge 20 ]] || die "Node.js $("$NODE_BIN" -v) est trop ancien : la version 20 ou plus est requise."
fi

# Docker : nécessaire à la base Supabase locale
if ! command -v docker >/dev/null; then
  echo "  Installation de Docker…"
  if command -v pacman >/dev/null; then pacman -Sy --noconfirm --needed docker
  else curl -fsSL https://get.docker.com | sh >/dev/null || warn "Installation automatique de Docker impossible : https://docs.docker.com/engine/install/"
  fi
fi
if command -v docker >/dev/null; then
  systemctl enable --now docker >/dev/null 2>&1 || true
  if [[ "$RUN_USER" != "root" ]] && ! id -nG "$RUN_USER" | tr ' ' '\n' | grep -qx docker; then
    usermod -aG docker "$RUN_USER"
    echo "  $RUN_USER ajouté au groupe docker."
  fi
fi
echo "  node $("$NODE_BIN" -v) · $(git --version) · $(docker --version 2>/dev/null || echo 'Docker absent')"

# Le dossier appartient au compte du service (git, npm et les compilations y écrivent)
chown -R "$RUN_USER" "$APP_DIR"
systemctl stop "$SERVICE" 2>/dev/null || true

say "Préparation de l'application"
sudo -u "$RUN_USER" -H "$NODE_BIN" "$APP_DIR/deploy/agent.mjs" setup "${SETUP_ARGS[@]+"${SETUP_ARGS[@]}"}"

say "Service systemd"
cat > "$UNIT" <<EOF
[Unit]
Description=RentPlan (application et mises à jour automatiques)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
ExecStart="${NODE_BIN}" "${APP_DIR}/deploy/start.mjs"
Environment="PATH=$(dirname "$NODE_BIN"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$SERVICE" >/dev/null

PORT="$("$NODE_BIN" -p 'require(process.argv[1]).port' "$APP_DIR/deploy/config.json")"
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "${PORT}/tcp" >/dev/null && echo "  Pare-feu (ufw) : port ${PORT} ouvert."
fi

cat <<EOF

✓ RentPlan est installé et démarre avec la machine.
  Ouvrez http://localhost:${PORT}
  puis créez le compte administrateur : un assistant vous guide pour le reste.

  Mises à jour  : automatiques depuis GitHub
  Journal       : journalctl -u ${SERVICE} -f
  Désinstaller  : bash "${APP_DIR}/install.sh" --uninstall
EOF
