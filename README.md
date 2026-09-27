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
| `pnpm test` | Vitest unit and integration tests (needs Postgres and Redis; uses the `edushare_test` DB and Redis DB 15). Set `MEILI_TEST_HOST`/`MEILI_TEST_KEY` or `S3_TEST_ENDPOINT` to also run the Meilisearch and S3 suites. |
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

## Optional features

Everything below is off or auto-detected by default. Turn features on with the environment variables listed in `.env.example`.

| Feature | How it works | Enable |
| --- | --- | --- |
| **Office previews** | The worker converts Word, PowerPoint, Excel and ODT files to a PDF rendition with LibreOffice. The rendition powers the online preview, the first-page thumbnail and the page count, and gives searchable text for legacy `.doc`/`.ppt`/`.xls`. Visitors still download the original file. | Auto-detected (installed in the worker image) |
| **Auto-classification** | Class, subject, type, year, term and topic are inferred from the title, the file name and the document header ("PRIMARY SIX END OF TERM II EXAMINATION 2026"). Only empty fields are filled, and it is recorded in the audit log. The upload form pre-fills suggestions as you type. | Always on |
| **Spreadsheet import** | *Uploads → Spreadsheet import*: download the template, fill `file_name, title, class, subject, type, year, term, tags…` (friendly values like "P6", "SST" and "Past Paper" are accepted), validate, then upload the files. Rows with a `slug` and no file update existing resources. | Always on |
| **Starter topics** | About 230 syllabus topics across the main subjects are seeded, for topic landing pages and classification. | `pnpm db:seed` |
| **Trending pages** | `/trending` (today), `/trending/week`, `/popular` (most downloaded) and `/new`, all filterable by class, subject and type. Class pages link to "Most downloaded P6" and similar. | Always on |
| **No-result report** | A weekly digest of searches that found nothing (worker job, Monday 06:00) plus a CSV export in *Analytics*. | Always on |
| **SEO suggestions** | *SEO* lists the landing pages most worth custom text, ranked by search demand and content. | Always on |
| **OCR** | Scanned PDFs and images with no text layer are OCR'd with Tesseract, so their contents become searchable. | `OCR_ENABLED=true` |
| **AI summaries** | Claude (`claude-opus-5`, low effort, structured output, refusal fallbacks enabled) proposes a short description, a summary, keywords and a classification. Admins apply suggestions field by field; nothing is published automatically. | `AI_ENRICH_ENABLED=true` + `ANTHROPIC_API_KEY` |
| **Meilisearch** | A drop-in `SearchProvider` with typo tolerance, synonyms, facets and highlighting. Postgres vectors stay up to date, so you can switch back at any time. | `docker compose --profile meilisearch up -d`, `SEARCH_PROVIDER=meilisearch`, then *Settings → Rebuild search index* |
| **S3 / MinIO / R2** | A drop-in `StorageProvider` using multipart uploads, range reads and signed download URLs. Processing works on temporary local copies. | `STORAGE_DRIVER=s3` + `S3_*` (`--profile minio` for self-hosted MinIO) |
| **CDN** | Serve thumbnails from a CDN or public bucket, and Next.js assets from a CDN. CSP is widened automatically. | `MEDIA_BASE_URL`, `ASSET_PREFIX` |
| **HTTP 410** | Unpublished and archived resources answer `410 Gone`, so search engines drop them quickly. Renamed slugs answer 301. | Always on |

The admin *Settings* page shows which optional features are active on the server.

## Production deployment (Ubuntu/Debian + Docker Compose)

**One command from your computer** (fresh Ubuntu server, e.g. AWS Lightsail with at least 2 GB RAM;
open ports 22, 80 and 443 in the instance firewall first):

```bash
scripts/lightsail-deploy.sh ~/Downloads/LightsailDefaultKey-eu-central-1.pem ubuntu@<server-ip> you@school.ug [your-domain]
```

It uploads the committed code and runs `scripts/server-bootstrap.sh` on the server. That script adds swap,
installs Docker, generates `.env` secrets, gets Let's Encrypt certificates, builds, starts the stack and
creates the first administrator (it prints the password once). It also sets up certificate renewal and
nightly backups. Without a domain it uses `<ip>.sslip.io` and `admin.<ip>.sslip.io`. Re-run the same
command to deploy updates.

Manual steps:

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

- **Updates**: `scripts/deploy.sh`. **Backups**: `scripts/backup.sh` (pg_dump plus a storage archive, 14-day retention; add it to cron). **Restore**: `scripts/restore.sh <db.dump> [storage.tar.gz]`. Practise a restore on a staging server regularly.
- **Malware scanning**: uncomment the `clamav` service and set `CLAMAV_HOST=clamav` on the worker.
- **Behind a TLS-intercepting proxy**: pass `--secret id=extra_ca,src=ca.crt` to `docker build`.
- Only Nginx is exposed. PostgreSQL, Redis and the apps stay on the internal Docker network.

## Roadmap (architecture already prepared)
OpenSearch provider · teacher accounts and moderated uploads · ratings and comments · AI recommendations · curriculum matching.
