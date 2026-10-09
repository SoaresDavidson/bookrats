# Bookrats

A shared-reading dashboard for two friends reading the same book on different devices. It collects progress automatically from KOReader and CrossPoint (via a built-in kosync server) and from the Kindle app (via Goodreads), and shows where each reader is and how far each advanced per session.

It runs on your own homelab, published to the internet with Tailscale Funnel (no domain or open router port needed).

## Development

```bash
cd backend
uv sync
uv run pytest
BOOKRATS_DB=./bookrats.db uv run uvicorn bookrats.asgi:app --reload
# serve the web app at /app/ (after `npm run build` in web/):
BOOKRATS_WEB_DIST=../web/dist BOOKRATS_DB=./bookrats.db uv run uvicorn bookrats.asgi:app --reload
```

CLI: `uv run bookrats --help`.

## Deploy

1. In the Tailscale admin console:
   - DNS → enable MagicDNS and HTTPS Certificates.
   - Access controls → make sure the policy grants Funnel (`"nodeAttrs": [{"target": ["autogroup:member"], "attr": ["funnel"]}]`; new tailnets have it by default).
   - Settings → Keys → generate an auth key and put it in `deploy/.env` as `TS_AUTHKEY` (see `deploy/.env.example`).
2. Start the stack:
   ```bash
   cd deploy && docker compose up -d --build
   ```
   The `tailscale` container joins the tailnet as `bookrats` and Funnel serves `https://bookrats.<tailnet>.ts.net` (proxying to the app on port 8000 via `deploy/tailscale/serve.json`). Find the exact URL in the admin console's Machines list, then check `https://bookrats.<tailnet>.ts.net/healthcheck`. The first HTTPS request can take a few seconds while the certificate is issued.
3. Seed users and the shared reading:
   ```bash
   docker compose exec bookrats bookrats add-user --name Davi --kosync-user davi --kosync-password <password>
   docker compose exec bookrats bookrats add-user --name Colega --goodreads-id 123456
   docker compose exec bookrats bookrats new-reading --title "Duna" --author "Frank Herbert" --goodreads-book-id 44767458
   ```
   Each `add-user` prints an `api_token` for the widgets and web app. A user created without `--goodreads-id` (manual progress only) can be linked later with `bookrats set-goodreads --name Colega --goodreads-id 123456`.

## Configure readers

**KOReader:** Tools → Progress sync → Custom sync server → `https://bookrats.<tailnet>.ts.net`, then log in with your kosync user and password.

**CrossPoint:** Settings → System → KOReader Sync → Sync Server URL. Set Document matching to Binary on both devices, and the server type to "Other" so title and authors are sent. Sync is manual, via Sync Progress or a long-press shortcut set to KOSync.
