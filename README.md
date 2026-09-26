# EduShare Uganda

A fast, mobile-first, SEO-friendly **public library of free educational resources** for Ugandan schools, teachers, learners and parents.

Visitors search, preview, download and share past papers, notes, schemes of work, lesson plans and more, with **no account, no payment and no email**. Only administrators sign in, to upload and manage resources.

```
SEARCH → FIND → PREVIEW → DOWNLOAD FREE → SHARE
```

## Architecture

```
INTERNET ─▶ NGINX (TLS, gzip, caching, rate limits, X-Accel file delivery)
              ├── web    Next.js 16 public site (SSR/ISR, Metadata API, PWA)
              ├── admin  Next.js 16 dashboard (TanStack Query, RHF + Zod)
              └── api    Hono REST API ──┬── PostgreSQL 16 (Drizzle, FTS, pg_trgm)
                                         ├── Redis 7 (cache, rate limits, counters, BullMQ)
                                         └── Storage (local disk, provider abstraction)
              worker  BullMQ jobs: text extraction, thumbnails, indexing, analytics, sitemaps
```

| Path | What it is |
| --- | --- |
| `apps/web` | Public site: home, search, resource pages, PDF.js preview, landing pages, sitemaps, robots, manifest, service worker |
| `apps/admin` | Admin dashboard: upload, bulk upload, edit and versions, publishing, taxonomy, collections, SEO, analytics, homepage, users and roles, audit log, settings |
| `apps/api` | Hono API: public, download/preview/media and admin modules; RBAC, CSRF, rate limits, streaming uploads |
| `apps/worker` | BullMQ worker and repeatable maintenance schedule |
| `packages/database` | Drizzle schema, SQL migrations, Uganda seed data (levels, classes, subjects, types, terms, years, roles) |
| `packages/search` | `SearchProvider` interface and `PostgresSearchProvider` (query understanding, synonyms, spelling correction, facets, suggestions) |
| `packages/storage` | `StorageProvider` interface and `LocalFilesystemStorageProvider` (path-traversal-safe, atomic writes, ranges) |
| `packages/documents` | Signature-based file detection, text/metadata extraction (PDF.js, Mammoth, SheetJS, PPTX/ODT), thumbnails (Sharp, WebP/AVIF), malware-scanner hook |
| `packages/resources` | Business logic: resources, versions, duplicates, processing pipeline, taxonomy, landing pages, collections, home, sitemaps |
| `packages/analytics` | Anonymous first-party event recording, aggregation, popularity and trending, dashboard reports |
| `packages/auth` | Argon2id hashing, server-side sessions, permissions |
| `packages/seo` | Titles and descriptions, JSON-LD (LearningResource, BreadcrumbList, WebSite + SearchAction, CollectionPage), sitemap XML |
| `packages/cache`, `packages/jobs` | Redis helpers (namespaced cache, rate limiting, dedup, counters) and queue definitions |
| `packages/ui` | shadcn/ui-style components and skeletons shared by both Next.js apps |
| `packages/shared` | Zod schemas, DTO types, constants, errors, formatting |

## Quick start (development)

Requirements: Node 22+, pnpm 10, PostgreSQL 16 and Redis 7. You can start the databases with `docker compose -f docker-compose.dev.yml up -d`.

```bash
pnpm install
cp .env.example .env            # set STORAGE_ROOT to an absolute path
pnpm db:migrate && pnpm db:seed
pnpm admin:create               # uses SEED_ADMIN_* from .env
pnpm dev                        # web :3000 · admin :3001 · api :4000 · worker
```

Sign in at <http://localhost:3001> and upload a PDF. `node scripts/make-sample-pdf.mjs` creates a sample exam paper. Publish it, then search for "P6 SST past paper" at <http://localhost:3000>.

### Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run all apps in watch mode |
| `pnpm build` | Build all apps |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | ESLint, Prettier, TypeScript strict |
| `pnpm test` | Vitest unit and integration tests (needs Postgres and Redis; uses the `edushare_test` DB and Redis DB 15) |
| `pnpm test:e2e` | Playwright: starts the full stack on ports 3100/3101/4100 against `edushare_test` |
| `pnpm db:generate` | Generate a migration after changing the Drizzle schema |

## How it works

### Upload → publish pipeline
1. The admin uploads a file. It is **streamed** to `storage/temporary` while its SHA-256 and size limit are checked.
2. The file type is verified by its **signature** (magic bytes), never by extension alone. A mismatched extension is rejected with a 415.
3. The file moves to `storage/resources/YYYY/MM/<uuid>.<ext>`, and the resource plus version 1 are created as a draft. Possible duplicates (same hash, similar title, same class, subject or year) are reported but never deleted automatically.
4. The worker then runs a **scan** (ClamAV hook), **extracts text and metadata** (no OCR), renders a **thumbnail** (first PDF page or a branded cover) in WebP 320/640/1200 plus AVIF, and **indexes** the resource.
5. On **publish** the resource is indexed, caches are invalidated, and the worker asks Next.js to revalidate the affected tags (resource page, landing pages, home, sitemaps).
6. "Publish when processing completes" is honoured once the security scan has passed. Unscanned or infected files are never served.

Replacing a file creates a new **version**, and any earlier version can be made public again. Renaming a slug keeps a permanent redirect.

### Search
PostgreSQL full-text search behind the `SearchProvider` interface, so a `MeilisearchProvider` or `OpenSearchProvider` can be added in `packages/search` without touching the resource module.

- **Weighted document**: title (A) > class, subject, type, year and term incl. aliases (B) > topic, tags and keywords (C) > description, author and file name (D). Extracted document text lives in a separate, length-normalised `content_vector`, so a word buried in a 100-page PDF ranks below a title match.
- **Query understanding**: `P6 SST past paper` is read as class `p6`, subject Social Studies and type Past Papers, using class, subject and type aliases. `p.6`, `primary six`, `senior 3`, `term two` and `s.s.t` are normalised. Recognised entities become filters; any remaining words must all match (prefix matching, synonyms such as exam ↔ examination and PLE).
- **Fallbacks**: if nothing matches, it relaxes to any-word ranking, then spelling correction ("chemstry" → "chemistry"), then trigram similarity (`pg_trgm`). Quoted or negated queries use `websearch_to_tsquery`.
- Highlighted titles and snippets, facet counts (class, subject, type, year, term, file type), and suggestions for landing combinations ("P6 Science Past Papers"), titles and popular queries, cached in Redis.
- **No-result page**: did-you-mean, per-word searches, subjects actually offered for the class ("Chemistry isn't available for P6 …") and popular resources.

### SEO
Server-rendered pages with the Metadata API (titles, descriptions, canonicals, Open Graph, Twitter cards), generated **Open Graph images** ("FREE DOWNLOAD"), JSON-LD, breadcrumbs, a sitemap index with paginated resource sitemaps, and `robots.txt`.

Landing pages are generated from the taxonomy: `/past-papers`, `/p7/past-papers`, `/p6/science`, `/p6/science/past-papers`, `/p6/science/past-papers/2026`, `/classes/p6`, `/subjects/science`, `/subjects/science/notes` and `/topics/<slug>`. Admins can override titles, descriptions and intro text per path, and empty landing pages are `noindex`. Unknown paths return a real 404 (existence is checked in a layout, outside the loading boundary).

### Caching
Browser → Nginx micro-cache → Next.js ISR (tagged fetches, on-demand `revalidateTag`) → Redis (namespaced, versioned invalidation) → PostgreSQL. Admin responses are always `no-store`. Thumbnails are immutable. Downloads are tracked by the API and then streamed by Nginx via `X-Accel-Redirect`, with Range support.

### Analytics (anonymous, first-party)
Tracked events: `resource_view` (client beacon, de-duplicated for 30 minutes), `resource_download` (server-side, retries and resumes not double counted), `resource_share` (per channel), `search`, `search_no_result`, `filter_use` and `related_resource_click`.

Visitors are identified only by a **daily-rotating salted hash**. Raw IP addresses are never stored, and bots and link previewers (for example the WhatsApp preview fetcher) are excluded. The worker aggregates daily stats every 15 minutes and computes `trending_day`, `trending_week` (2-day half-life) and a long-term `popularity` score. Downloads weigh 3× and shares 4× a view.

### Security
- Argon2id password hashing, opaque session tokens (only their SHA-256 is stored), HttpOnly/SameSite cookies, and idle plus absolute expiry. Sessions are invalidated on password change.
- Per-session CSRF token plus Origin check, RBAC (`super_admin`, `admin`, `content_manager`, `editor`, `moderator`), and an audit log of uploads, edits, SEO changes, status changes, replacements, deletions and sign-ins.
- Rate limits in both Redis and Nginx. Downloads are keyed by IP and user agent, so a shared school network is not blocked.
- Zod validation everywhere, parameterised SQL, strict upload validation and limits, path-traversal-safe storage keys, CSP and security headers, and generic error messages (details are only logged).

## Production deployment (Ubuntu/Debian + Docker Compose)

```bash
sudo mkdir -p /opt/edushare/storage/{resources,thumbnails,previews,temporary,private} /opt/edushare/backups
sudo chown -R 1000:1000 /opt/edushare/storage        # containers run as the `node` user (uid 1000)
git clone <repo> /opt/edushare/app && cd /opt/edushare/app
cp .env.production.example .env && nano .env          # domains, passwords, secrets (openssl rand -base64 32)
# TLS: obtain certificates, e.g. certbot certonly --webroot -w docker/certbot-www -d edushare.ug -d admin.edushare.ug
docker compose build
docker compose up -d                                   # runs migrations + seed automatically (migrate service)
docker compose run --rm api node dist/scripts/create-admin.js you@school.ug "Your Name"
```

- **Updates**: `scripts/deploy.sh`. **Backups**: `scripts/backup.sh` (pg_dump plus a storage archive, 14-day retention; add it to cron).
- **Malware scanning**: uncomment the `clamav` service and set `CLAMAV_HOST=clamav` on the worker.
- **Behind a TLS-intercepting proxy**: pass `--secret id=extra_ca,src=ca.crt` to `docker build`.
- Only Nginx is exposed. PostgreSQL, Redis and the apps stay on the internal Docker network.

## Roadmap (architecture already prepared)
Meilisearch/OpenSearch providers · MinIO/S3/R2 storage providers · OCR for scanned PDFs · CSV/Excel metadata import · teacher accounts and moderated uploads · ratings and comments · AI summaries, recommendations and auto-classification.
