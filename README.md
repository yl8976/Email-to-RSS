# Email-to-RSS

Convert email newsletters into a private RSS feed using Cloudflare Workers + ForwardEmail.

This project is self-hosted, uses your own domain, and keeps your data in your own Cloudflare account.

## Why this exists

Many newsletters only support email delivery. RSS readers offer a better reading experience, but getting email-only newsletters into RSS usually means relying on shared third-party infrastructure.

Email-to-RSS keeps the same workflow while avoiding shared domains and shared data stores.

## Features

- One-click feed creation from an admin dashboard
- Bulk feed/email deletion from the admin dashboard (safe checkbox-based flow)
- Inline double-confirm delete interactions with toast feedback in the admin dashboard
- Resizable + sortable table columns in the admin dashboard (Table view)
- Unique newsletter addresses per feed (for example `apple.mountain.42@yourdomain.com`)
- ForwardEmail webhook ingestion with source-IP verification
- Optional per-feed sender allowlist (`email@domain.com` or `domain.com`)
- RSS generation on demand (`/rss/:feedId`)
- Cloudflare KV storage for feed config + email metadata/content
- Password-protected admin UI
- Fully self-hosted on your Cloudflare account

## Architecture

1. ForwardEmail forwards inbound messages to `https://yourdomain.com/api/inbound`.
2. The Worker validates the request source against ForwardEmail MX IP ranges.
3. The Worker parses and stores incoming content in KV.
4. `https://yourdomain.com/rss/:feedId` renders RSS from stored items.
5. `/admin` provides feed management and email deletion.

Main routes:

- `src/routes/inbound.ts`: webhook ingestion
- `src/routes/rss.ts`: RSS rendering
- `src/routes/admin.ts`: admin UI + feed CRUD

## Requirements

- Node.js 20+
- A Cloudflare account
- A domain managed in Cloudflare DNS
- A ForwardEmail account

## Setup

1. Clone this repository.
2. Authenticate Wrangler:
   ```bash
   npx wrangler login
   ```
3. Run setup:
   ```bash
   bash setup.sh
   ```

`setup.sh` will:

- install npm dependencies
- verify Cloudflare auth (`wrangler whoami`)
- create KV namespaces (`EMAIL_STORAGE` + preview)
- set the `ADMIN_PASSWORD` secret in `production`
- generate `wrangler.toml` from `wrangler-example.toml`
- stamp `compatibility_date` to the current date

4. Configure ForwardEmail DNS records in Cloudflare:

| Type | Name | Content                                              | Notes                   |
| ---- | ---- | ---------------------------------------------------- | ----------------------- |
| MX   | @    | `mx1.forwardemail.net`                               | Priority `10`, DNS only |
| MX   | @    | `mx2.forwardemail.net`                               | Priority `10`, DNS only |
| TXT  | @    | `"forward-email=https://yourdomain.com/api/inbound"` | webhook target          |
| TXT  | @    | `"v=spf1 include:spf.forwardemail.net -all"`         | SPF                     |

5. Deploy:

   ```bash
   npm run deploy
   ```

6. Open `https://yourdomain.com/admin` and sign in.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

## Configuration notes

- `wrangler-example.toml` is the template; `wrangler.toml` is generated locally.
- Keep `compatibility_date` fresh when doing runtime upgrades.
- `ADMIN_PASSWORD` is a Cloudflare Worker secret, not a plain env var in config.

## Security notes

- Inbound webhook access is IP-restricted to ForwardEmail MX sources.
- Admin auth uses a signed, `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
- Admin responses are `no-store` to avoid cache leakage.
- For high-value feeds, set `Allowed senders` so only known sender addresses/domains are accepted.
- You should use a strong admin password and rotate periodically.

## Spam cleanup runbook

### UI-first cleanup

1. Open `/admin`.
2. Switch to **Table** view.
3. Use the search box to filter obvious spam feeds.
   - Long titles/URLs are truncated; hover to see the full value. Click to copy.
   - Drag the column separators to resize; click headers to sort (double-click a separator to reset width).
4. Use **Select Results** to select the filtered rows, then click **Delete Selected**.
   - Bulk deletes run in small batches so the UI stays responsive. Keep the tab open until it finishes.
5. For legitimate feeds that got spam emails, open **Emails**, filter by subject, then **Select Results** and **Delete Selected**.

## Upgrading dependencies

To refresh dependencies to latest:

```bash
npm outdated
npm install
npm test
npm run build
```

Then update `compatibility_date` and redeploy.

## License

MIT
