#!/usr/bin/env bash
# Deploys the current checkout to a server over SSH. Run it from your own computer:
#   scripts/lightsail-deploy.sh <ssh-key.pem> <user@host> <admin-email> [public-domain]
# Without a domain it uses <ip>.sslip.io (free wildcard DNS), so HTTPS works straight away.
# The server needs ports 22, 80 and 443 open (Lightsail: Networking tab → IPv4 firewall).
set -euo pipefail

KEY="${1:?usage: $0 <key.pem> <user@host> <admin-email> [domain]}"
TARGET="${2:?usage: $0 <key.pem> <user@host> <admin-email> [domain]}"
ADMIN_EMAIL="${3:?usage: $0 <key.pem> <user@host> <admin-email> [domain]}"
HOST="${TARGET#*@}"
DOMAIN="${4:-${HOST//./-}.sslip.io}"
APP=/opt/edushare/app

cd "$(dirname "$0")/.."
chmod 600 "$KEY"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 "$TARGET")

echo "Deploying $(git rev-parse --short HEAD) to $TARGET as https://$DOMAIN"
if [ -n "$(git status --porcelain)" ]; then
  echo "Note: uncommitted changes are NOT deployed (only committed HEAD is sent)."
fi

# Ship the committed tree; keep the server's .env (secrets) across deploys.
git archive --format=tar.gz HEAD | "${SSH[@]}" "set -e
  sudo rm -rf $APP.new && sudo mkdir -p $APP.new $APP
  sudo tar -xzf - -C $APP.new
  if [ -f $APP/.env ]; then sudo cp -p $APP/.env $APP.new/.env; fi
  sudo rm -rf $APP.old && sudo mv $APP $APP.old && sudo mv $APP.new $APP"

"${SSH[@]}" -t "sudo bash $APP/scripts/server-bootstrap.sh '$DOMAIN' '$ADMIN_EMAIL'"
