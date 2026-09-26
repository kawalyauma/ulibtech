# syntax=docker/dockerfile:1.7
# Multi-target build for the EduShare monorepo: api, worker, web, admin.
#   docker build -f docker/Dockerfile --target api .

ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Optional: behind a TLS-intercepting proxy, pass its CA as a build secret:
#   docker build --secret id=extra_ca,src=/path/ca.crt ...
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm install -g pnpm@10.33.0
WORKDIR /repo

# ---------------------------------------------------------------- dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile

# ---------------------------------------------------------------- node services
FROM deps AS build-node
RUN pnpm --filter @edushare/api build && pnpm --filter @edushare/worker build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm --filter @edushare/api deploy --prod --legacy --config.node-linker=hoisted /out/api && \
    pnpm --filter @edushare/worker deploy --prod --legacy --config.node-linker=hoisted /out/worker && \
    cp -r apps/api/dist /out/api/dist && cp -r apps/worker/dist /out/worker/dist && \
    cp -r packages/database/drizzle /out/api/drizzle

FROM node:${NODE_VERSION} AS runtime-node
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends tini fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/edushare/storage && chown -R node:node /opt/edushare
WORKDIR /app
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM runtime-node AS api
COPY --from=build-node --chown=node:node /out/api /app
ENV API_PORT=4000 MIGRATIONS_DIR=/app/drizzle STORAGE_ROOT=/opt/edushare/storage TRUST_PROXY=true
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

FROM runtime-node AS worker
USER root
# LibreOffice converts Office files to PDF (previews, thumbnails, legacy .doc/.ppt/.xls text).
# Tesseract enables optional OCR of scanned PDFs (set OCR_ENABLED=true).
ARG INSTALL_LIBREOFFICE=true
ARG INSTALL_TESSERACT=true
RUN apt-get update && \
    if [ "$INSTALL_LIBREOFFICE" = "true" ]; then apt-get install -y --no-install-recommends libreoffice-writer libreoffice-impress libreoffice-calc fonts-crosextra-carlito fonts-crosextra-caladea; fi && \
    if [ "$INSTALL_TESSERACT" = "true" ]; then apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng; fi && \
    rm -rf /var/lib/apt/lists/*
USER node
COPY --from=build-node --chown=node:node /out/worker /app
ENV STORAGE_ROOT=/opt/edushare/storage
CMD ["node", "dist/index.js"]

# ---------------------------------------------------------------- next.js apps
FROM deps AS build-web
ARG PUBLIC_SITE_URL=https://edushare.example
ARG SITE_NAME="EduShare Uganda"
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL SITE_NAME=$SITE_NAME
RUN pnpm --filter @edushare/web build

FROM deps AS build-admin
ARG PUBLIC_SITE_URL=https://edushare.example
ARG MAX_UPLOAD_MB=100
ENV NEXT_PUBLIC_SITE_URL=$PUBLIC_SITE_URL NEXT_PUBLIC_MAX_UPLOAD_MB=$MAX_UPLOAD_MB
RUN pnpm --filter @edushare/admin build

FROM node:${NODE_VERSION} AS runtime-next
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends tini curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM runtime-next AS web
COPY --from=build-web --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build-web --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build-web --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --chown=node:node docker/web-entrypoint.sh /app/entrypoint.sh
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD curl -fsS http://127.0.0.1:3000/robots.txt >/dev/null || exit 1
CMD ["sh", "/app/entrypoint.sh"]

FROM runtime-next AS admin
COPY --from=build-admin --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=build-admin --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build-admin --chown=node:node /repo/apps/admin/public ./apps/admin/public
ENV PORT=3001
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
