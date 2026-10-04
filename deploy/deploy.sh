#!/usr/bin/env bash
# Build LTor locally and deploy the web demo to a VPS (Plesk/Apache).
#
#   deploy/deploy.sh <ssh-host> [plesk-docroot]
#
#   <ssh-host>       e.g. deploy@203.0.113.10 or a Host alias from ~/.ssh/config
#   [plesk-docroot]  default /var/www/vhosts/maazi.de/ltor.maazi.de
#                    (Plesk → ltor.maazi.de → Hosting-Einstellungen → Dokumentstamm)
#
# Optional environment:
#   SSH_KEY=~/.ssh/id_ed25519   private key
#   SSH_PORT=22                 SSH port (default 22)
#
#   SSH_KEY=~/.ssh/id_ed25519 SSH_PORT=22 deploy/deploy.sh deploy@203.0.113.10
#
# Runs in Git Bash on Windows, macOS or Linux. Needs: node/npm, tar, ssh, scp.
# The remote part asks for the sudo password of the SSH user once.
set -euo pipefail

HOST="${1:?Usage: deploy/deploy.sh <ssh-host> [plesk-docroot]}"
SSH_ARGS=(-p "${SSH_PORT:-22}")
SCP_ARGS=(-P "${SSH_PORT:-22}")
if [ -n "${SSH_KEY:-}" ]; then
  SSH_ARGS+=(-i "$SSH_KEY")
  SCP_ARGS+=(-i "$SSH_KEY")
fi
DOCROOT="${2:-/var/www/vhosts/maazi.de/ltor.maazi.de}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▶ 1/4 Physik-Selbsttest"
npm run --silent test:physics > /dev/null

echo "▶ 2/4 Build (Web-Frontend + Server-Bundle)"
npm run --silent build:online

echo "▶ 3/4 Release-Paket"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/ltor-release"
cp -r out/web "$STAGE/ltor-release/web"
cp -r out/server "$STAGE/ltor-release/server"
cp deploy/ltor-backend.service deploy/remote-install.sh "$STAGE/ltor-release/"
tar -czf "$STAGE/ltor-release.tgz" -C "$STAGE" ltor-release
echo "  $(du -h "$STAGE/ltor-release.tgz" | cut -f1) → $HOST"

echo "▶ 4/4 Upload & Installation auf dem VPS"
scp "${SCP_ARGS[@]}" "$STAGE/ltor-release.tgz" "$HOST:~/ltor-release.tgz"
ssh -t "${SSH_ARGS[@]}" "$HOST" "rm -rf ~/ltor-release && tar -xzf ~/ltor-release.tgz -C ~ && bash ~/ltor-release/remote-install.sh '$DOCROOT'"
