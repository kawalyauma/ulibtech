#!/usr/bin/env bash
# Nightly backup: PostgreSQL dump + storage archive, keeping 14 days.
# Cron example: 30 1 * * * /opt/edushare/app/scripts/backup.sh >> /var/log/edushare-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${BACKUP_DIR:-/opt/edushare/backups}"
STORAGE="${STORAGE_PATH:-/opt/edushare/storage}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DEST/db-$STAMP.dump"
tar --exclude='temporary/*' -czf "$DEST/storage-$STAMP.tar.gz" -C "$STORAGE" .
find "$DEST" -type f -mtime +14 -delete
echo "Backup complete: $STAMP"
