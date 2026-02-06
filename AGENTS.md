# AGENTS.md

This file gives coding agents fast context for working in this repository.

## Project summary

Email-to-RSS is a Cloudflare Worker that ingests newsletters from ForwardEmail and exposes them as RSS feeds.

Core goals:

- Self-hosted and private
- Free-tier-friendly (Cloudflare + ForwardEmail)
- Minimal operational overhead

## Runtime and stack

- Runtime: Cloudflare Workers
- Framework: Hono (`src/index.ts` + `src/routes/*`)
- Storage: Cloudflare KV (`EMAIL_STORAGE` binding)
- Typescript + Vitest for development/testing

## Important files

- `setup.sh`: bootstraps local setup, KV namespaces, secrets, and local Wrangler config
- `wrangler-example.toml`: template used by setup
- `src/index.ts`: app boot + CORS + inbound IP allowlist middleware
- `src/routes/inbound.ts`: email ingestion endpoint
- `src/routes/rss.ts`: RSS rendering endpoint
- `src/routes/admin.ts`: admin UI and feed/email management
- `src/test/setup.ts`: test runtime mocks (KV + Cache)

## KV data model

Current keys used by routes:

- `feeds:list` -> `{ feeds: Array<{ id, title }> }`
- `feeds:list.feeds[].description` -> optional description (used to keep the dashboard fast; older data may omit it)
- `feed:<feedId>:config` -> feed config object
- `feed:<feedId>:config.allowed_senders` -> optional sender allowlist (email or domain)
- `feed:<feedId>:metadata` -> `{ emails: Array<{ key, subject, receivedAt }> }`
- `feed:<feedId>:<timestamp>` -> stored email body/metadata

Notes:

- Some utility files contain alternate key helpers not used by routes (`src/utils/storage.ts`).
- Keep route behavior and key schema consistent when refactoring.

## Setup/deploy workflow

1. `npx wrangler login`
2. `bash setup.sh`
3. Configure ForwardEmail DNS records in Cloudflare
4. `npm run deploy`

`setup.sh` assumes Wrangler v4 command syntax (`wrangler kv namespace ...`).

## Development workflow

- Install: `npm install`
- Test: `npm test`
- Build (dry-run deploy bundle): `npm run build`
- Dev server: `npm run dev`

## Testing notes

- Tests run in Node environment (`vitest.config.ts`), not DOM.
- Hono v4 test requests pass env as the 3rd arg: `app.request(path, init, env)`.
- Some tests intentionally hit validation errors; stderr logs are expected.

## Security assumptions

- Inbound endpoint only accepts requests from ForwardEmail source IPs.
- Admin access uses a signed cookie gate and password stored in Worker secret (`ADMIN_PASSWORD`).
- Admin pages set `Cache-Control: no-store`.
- Prefer setting `allowed_senders` on legitimate feeds to reduce inbound spam.
- Do not hardcode credentials or domain-specific secrets into tracked files.

## Spam cleanup workflow

- First choice: use dashboard bulk actions (`/admin`) with search + checkbox selection.
- Use **Table** view for bulk delete.
- Table columns are resizable and sortable; widths persist per-browser via localStorage.
- **Select Results** selects all rows currently shown by the search filter; **Clear Selection** unselects everything.
- Bulk deletes are performed asynchronously (batched requests) so the UI stays responsive.
- Avoid wildcard deletion; prefer search + small batches to reduce risk of deleting legitimate feeds.

## Cloudflare/Wrangler conventions

- `wrangler.toml` is generated locally from `wrangler-example.toml`.
- Keep `compatibility_date` current on meaningful runtime upgrades.
- Prefer explicit `--env production` for deploy/secret commands.

## If you change behavior

Update all of the following together:

- `README.md`
- `setup.sh` (if setup/deploy assumptions changed)
- tests under `src/routes/*.test.ts` and `src/test/setup.ts`
