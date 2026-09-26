#!/usr/bin/env bash
# Pull, build and restart with minimal downtime.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose build
docker compose run --rm migrate
docker compose up -d --remove-orphans
docker image prune -f
echo "Deployed $(git rev-parse --short HEAD)"
