#!/usr/bin/env bash
# Prepares a fresh Ubuntu server and (re)deploys EduShare. Safe to run repeatedly.
# Normally invoked by scripts/lightsail-deploy.sh; can also be run on the server directly:
#   sudo bash /opt/edushare/app/scripts/server-bootstrap.sh <public-domain> <admin-email>
set -euo pipefail

PUBLIC_DOMAIN="${1:?public domain required}"
ADMIN_EMAIL="${2:?admin email required}"
ADMIN_DOMAIN="admin.${PUBLIC_DOMAIN}"
APP=/opt/edushare/app
STORAGE=/opt/edushare/storage
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }
cd "$APP"
log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- swap (Next.js builds need ~3 GB)
if [ "$(awk '/SwapTotal/ {print $2}' /proc/meminfo)" -lt 1000000 ]; then
  log "Adding 4 GB swap"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------------------------------------------------------------- Docker
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null

# ---------------------------------------------------------------- directories
mkdir -p "$STORAGE"/{resources,thumbnails,previews,temporary,private} /opt/edushare/backups "$APP/docker/certbot-www"
chown -R 1000:1000 "$STORAGE" # the containers run as the image's `node` user (uid 1000)

# ---------------------------------------------------------------- .env (secrets generated once, then kept)
if [ ! -f .env ]; then
  log "Generating .env with fresh secrets"
  rand() { openssl rand -hex "$1"; }
  cat > .env <<EOF
PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
ADMIN_DOMAIN=${ADMIN_DOMAIN}
SITE_NAME="EduShare Uganda"
POSTGRES_USER=edushare
POSTGRES_DB=edushare
POSTGRES_PASSWORD=$(rand 24)
ANALYTICS_SALT=$(rand 32)
REVALIDATE_SECRET=$(rand 32)
STORAGE_PATH=${STORAGE}
CERTS_PATH=/etc/letsencrypt/live
CERTS_ARCHIVE_PATH=/etc/letsencrypt/archive
MAX_UPLOAD_MB=100
WORKER_PROCESSING_CONCURRENCY=1
EOF
  chmod 600 .env
fi

# ---------------------------------------------------------------- TLS certificates (Let's Encrypt)
need_cert=false
for d in "$PUBLIC_DOMAIN" "$ADMIN_DOMAIN"; do [ -f "/etc/letsencrypt/live/$d/fullchain.pem" ] || need_cert=true; done
if $need_cert; then
  log "Requesting TLS certificates for $PUBLIC_DOMAIN and $ADMIN_DOMAIN"
  docker compose stop nginx >/dev/null 2>&1 || true # certbot needs port 80 for the challenge
  for d in "$PUBLIC_DOMAIN" "$ADMIN_DOMAIN"; do
    [ -f "/etc/letsencrypt/live/$d/fullchain.pem" ] && continue
    docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot certonly \
      --standalone --non-interactive --agree-tos -m "$ADMIN_EMAIL" -d "$d"
  done
fi
# Renewals go through Nginx's /.well-known/acme-challenge/ webroot, twice a day.
cat > /etc/cron.d/edushare-certbot <<EOF
17 3,15 * * * root docker run --rm -v /etc/letsencrypt:/etc/letsencrypt -v ${APP}/docker/certbot-www:/var/www/certbot certbot/certbot renew --quiet --webroot -w /var/www/certbot && cd ${APP} && docker compose exec -T nginx nginx -s reload
EOF
cat > /etc/cron.d/edushare-backup <<EOF
30 1 * * * root ${APP}/scripts/backup.sh >> /var/log/edushare-backup.log 2>&1
EOF

# ---------------------------------------------------------------- build & start
log "Building images (15-30 minutes on a small instance the first time)"
docker compose build
log "Starting the stack (migrations and seed run first)"
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

# ---------------------------------------------------------------- first administrator
admins=$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from admins"' 2>/dev/null || echo 0)
if [ "${admins//[[:space:]]/}" = "0" ]; then
  log "Creating the first administrator"
  pw="Edu$(openssl rand -hex 8)9"
  docker compose run --rm -e SEED_ADMIN_PASSWORD="$pw" api node dist/scripts/create-admin.js "$ADMIN_EMAIL" "Administrator"
  CREATED_PASSWORD="$pw"
fi

# ---------------------------------------------------------------- smoke test
log "Checking the site"
ok=false
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "https://${PUBLIC_DOMAIN}/robots.txt"; then ok=true; break; fi
  sleep 5
done
docker compose ps
echo
if $ok; then echo "Public site:  https://${PUBLIC_DOMAIN}"; else echo "WARNING: https://${PUBLIC_DOMAIN} is not answering yet; check: docker compose logs --tail=100"; fi
echo "Admin:        https://${ADMIN_DOMAIN}"
if [ -n "${CREATED_PASSWORD:-}" ]; then
  echo "Admin login:  ${ADMIN_EMAIL}"
  echo "Password:     ${CREATED_PASSWORD}   (shown once; change it after signing in)"
fi
