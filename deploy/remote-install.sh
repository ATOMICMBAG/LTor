#!/usr/bin/env bash
# Runs ON THE VPS (called by deploy/deploy.sh) as the SSH deploy user.
#   bash ~/ltor-release/remote-install.sh <plesk-docroot>
#
#   ~/ltor-release/web     → <plesk-docroot>           (static frontend)
#   ~/ltor-release/server  → /var/www/ltor/server      (Node backend)
#   ltor-backend.service   → /etc/systemd/system/      (127.0.0.1:8646)
set -euo pipefail

DOCROOT="${1:?Plesk document root missing}"
REL="$HOME/ltor-release"
APP=/var/www/ltor
PORT=8646
RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"

echo "── LTor Installation ──────────────────────────────"

# 1) Node.js ≥ 18
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "✗ node nicht gefunden (als $(whoami)). Bitte Node.js ≥ 18 installieren." >&2
  exit 1
fi
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ Node $("$NODE_BIN" -v) ist zu alt – mindestens 18 nötig." >&2
  exit 1
fi
echo "✓ Node $("$NODE_BIN" -v) ($NODE_BIN)"

# 2) Port free (or already ours)
if sudo ss -tlnp | grep -q ":$PORT\b"; then
  # Compare PIDs – the process name is not reliable (Node ≥ 24 shows "MainThread").
  OUR_PID="$(systemctl show -p MainPID --value ltor-backend 2>/dev/null || echo 0)"
  if [ "${OUR_PID:-0}" != "0" ] && sudo ss -tlnp | grep ":$PORT\b" | grep -q "pid=$OUR_PID,"; then
    echo "✓ Port $PORT gehört bereits ltor-backend (Update)"
  else
    echo "✗ Port $PORT ist von einem anderen Dienst belegt:" >&2
    sudo ss -tlnp | grep ":$PORT\b" >&2
    exit 1
  fi
else
  echo "✓ Port $PORT ist frei"
fi

# 3) Document root of the Plesk subdomain
if [ ! -d "$DOCROOT" ]; then
  echo "✗ Dokumentstamm $DOCROOT existiert nicht." >&2
  echo "  Pfad in Plesk prüfen: ltor.maazi.de → Hosting-Einstellungen → Dokumentstamm" >&2
  exit 1
fi
OWNER="$(stat -c '%U:%G' "$DOCROOT")"
echo "✓ Dokumentstamm $DOCROOT (Besitzer $OWNER)"

# 4) Backend
sudo mkdir -p "$APP"
sudo rm -rf "$APP/server.new"
sudo cp -r "$REL/server" "$APP/server.new"
sudo rm -rf "$APP/server.old"
[ -d "$APP/server" ] && sudo mv "$APP/server" "$APP/server.old"
sudo mv "$APP/server.new" "$APP/server"
sudo chown -R "$RUN_USER:$RUN_GROUP" "$APP"
echo "✓ Backend nach $APP/server kopiert"

sed -e "s#^ExecStart=.*#ExecStart=$NODE_BIN $APP/server/index.mjs#" \
    -e "s#__USER__#$RUN_USER#" -e "s#__GROUP__#$RUN_GROUP#" "$REL/ltor-backend.service" \
  | sudo tee /etc/systemd/system/ltor-backend.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable ltor-backend > /dev/null 2>&1
sudo systemctl restart ltor-backend
sleep 1.5
if curl -fsS "http://127.0.0.1:$PORT/ltor/health"; then
  echo
  echo "✓ Backend läuft (systemd: ltor-backend)"
else
  echo "✗ Backend antwortet nicht – Log:" >&2
  sudo journalctl -u ltor-backend -n 30 --no-pager >&2
  exit 1
fi

# 5) Frontend (keep Plesk's own files like .well-known / favicon untouched)
sudo find "$DOCROOT" -maxdepth 1 \( -name 'index.html' -o -name 'assets' \) -exec rm -rf {} +
sudo cp -r "$REL/web/." "$DOCROOT/"
sudo chown -R "$OWNER" "$DOCROOT/index.html" "$DOCROOT/assets"
echo "✓ Frontend nach $DOCROOT kopiert"

rm -rf "$REL" "$HOME/ltor-release.tgz"
echo "── fertig ──────────────────────────────────────────"
echo "Test:  curl -s https://ltor.maazi.de/ltor/health"
echo "Logs:  sudo journalctl -u ltor-backend -f"
