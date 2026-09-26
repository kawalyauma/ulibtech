#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh.
#   scripts/restore.sh /opt/edushare/backups/db-20260926-013000.dump [/opt/edushare/backups/storage-20260926-013000.tar.gz]
# Test restores regularly (e.g. monthly onto a staging server).
set -euo pipefail
cd "$(dirname "$0")/.."
DB_DUMP="${1:?usage: restore.sh <db-dump> [storage-archive]}"
STORAGE_ARCHIVE="${2:-}"
STORAGE="${STORAGE_PATH:-/opt/edushare/storage}"

read -r -p "This replaces the current database${STORAGE_ARCHIVE:+ and storage}. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "Aborted"; exit 1; }

docker compose stop web admin api worker
docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DB_DUMP"
if [ -n "$STORAGE_ARCHIVE" ]; then
  tar -xzf "$STORAGE_ARCHIVE" -C "$STORAGE"
  chown -R 1000:1000 "$STORAGE" 2>/dev/null || true
fi
docker compose run --rm migrate
docker compose up -d
echo "Restore complete. Rebuild the search index from Settings → Maintenance if you use Meilisearch."
