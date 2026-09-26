#!/bin/sh
# Starts the Next.js server, then revalidates all cached pages once it is ready so pages
# prerendered at build time (without API access) are refreshed immediately.
set -e
node apps/web/server.js &
PID=$!
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT:-3000}/robots.txt" >/dev/null 2>&1; then
    curl -fsS -X POST "http://127.0.0.1:${PORT:-3000}/api/revalidate" \
      -H "content-type: application/json" -H "x-revalidate-secret: ${REVALIDATE_SECRET}" \
      -d '{"tags":["all"]}' >/dev/null 2>&1 || true
    break
  fi
  sleep 1
done
wait $PID
