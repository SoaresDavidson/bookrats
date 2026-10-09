# Bookrats

A shared-reading dashboard for two friends reading the same book on different devices. It collects progress automatically from KOReader and CrossPoint (via a built-in kosync server) and from the Kindle app (via Goodreads), and shows where each reader is and how far each advanced per session.

It runs on your own homelab, exposed through a Cloudflare Tunnel.

## Development

```bash
cd backend
uv sync
uv run pytest
BOOKRATS_DB=./bookrats.db uv run uvicorn bookrats.asgi:app --reload
```

CLI: `uv run bookrats --help`.

## Deploy

1. In Cloudflare Zero Trust go to Networks → Tunnels and create a tunnel.
2. Add a public hostname `bookrats.<domain>` pointing to service `http://bookrats:8000`.
3. Copy the tunnel token into `deploy/.env` (see `deploy/.env.example`).
4. Start the stack:
   ```bash
   cd deploy && docker compose up -d
   ```
5. Seed users and the shared reading:
   ```bash
   docker compose exec bookrats bookrats add-user --name Davi --kosync-user davi --kosync-password <password>
   docker compose exec bookrats bookrats add-user --name Colega --goodreads-id 123456
   docker compose exec bookrats bookrats new-reading --title "Duna" --author "Frank Herbert" --goodreads-book-id 44767458
   ```
   Each `add-user` prints an `api_token` for the widgets and web app.

## Configure readers

**KOReader:** Tools → Progress sync → Custom sync server → `https://bookrats.<domain>`, then log in with your kosync user and password.

**CrossPoint:** Settings → System → KOReader Sync → Sync Server URL. Set Document matching to Binary on both devices, and the server type to "Other" so title and authors are sent. Sync is manual, via Sync Progress or a long-press shortcut set to KOSync.
