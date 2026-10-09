# Bookrats — project status (2026-10-09)

Handoff for the next session. Product spec: `docs/superpowers/specs/2026-10-08-bookrats-design.md`. Plans (all tasks done): `docs/superpowers/plans/2026-10-08-bookrats-backend.md`, `docs/superpowers/plans/2026-10-08-bookrats-clients.md`.

## What exists (all on `master`)

| Part | Path | Stack | Tests |
|---|---|---|---|
| Backend | `backend/` | Python 3.12, FastAPI, SQLite (WAL), uv | `cd backend && uv run pytest -q` (170) |
| Web (PWA) | `web/` | React 19, Vite, TS, Tailwind v4 (`src/styles/`), Vitest | `cd web && npx vitest run && npx tsc -b && npm run build` (97) |
| Android widget app | `mobile/` | Expo SDK 57, react-native-android-widget, expo-secure-store, safe-area-context; Jest (jest-expo) + React Native Testing Library | `cd mobile && npm test && npx tsc --noEmit` (26) |
| iPhone widget | `widgets/scriptable/bookrats.js` | Scriptable (iOS only) | `node --check widgets/scriptable/bookrats.js` |
| Deploy | `backend/Dockerfile` (multi-stage, context = repo root), `deploy/docker-compose.yml` (+ Tailscale Funnel, `deploy/tailscale/serve.json`), `.dockerignore` | Docker | `docker build -f backend/Dockerfile -t bookrats .` |

Lint and format: Biome for TS/JS/CSS (`biome.json` at the repo root, shared by `web/`, `mobile/` and `widgets/`; `npm run lint` / `npm run format` in `web/` or `mobile/`) and Ruff for Python (`[tool.ruff]` in `backend/pyproject.toml`; `uv run ruff check . && uv run ruff format .` in `backend/`). Line width 120 everywhere.

### Backend features
- kosync server API for KOReader and CrossPoint (`/users/auth`, `PUT/GET /syncs/progress`, `/healthcheck`); sign-up disabled; every sync stored as a snapshot; CrossPoint metadata (title/authors) stored.
- Goodreads updates RSS poller (15 min) for the colleague; progress items become document `gr:<book_id>`.
- `/api/*` (bearer token per user): summary (reading + cover + per-reader pct, last session, color), sessions, manual progress, readings list/activate/patch, start reading from a document, link documents, palette, `PUT /api/me/color` (palette id or custom hex with contrast-safe variants).
- Covers via Open Library, then Google Books (exact/prefix title match, never guesses); manual URL fallback.
- CLI: `bookrats add-user --name … --kosync-user … --kosync-password …` / `--goodreads-id …` (prints the API token), `bookrats set-goodreads --name … --goodreads-id …` (link an existing user), `bookrats new-reading --title … --author … --goodreads-book-id … --cover-url …`.
- Env: `BOOKRATS_DB`, `BOOKRATS_GOODREADS_POLL_SECONDS`, `BOOKRATS_WEB_DIST`. Web served at `/app`.

### Web features
Tabs Progresso / Estante / Gerenciar. Dashboard: cover + one bar per reader (last session, delta), who is ahead, animated first-load bars, live count-up + glow on updates, retractable animated history. Estante: cover grid with dock magnification, skeleton + per-cover spinner, detail dialog (start/finish dates, days, who finished first, Retomar, Editar). Gerenciar: progress, new reading, cover, color picker (two circles + popover + custom color), unlinked documents ("Começar a ler este" / "É este livro"). Light/dark, pt-BR, reduced motion respected.

## Run locally
```bash
cd web && npm ci && npm run build
cd ../backend && uv sync
export BOOKRATS_DB=/tmp/bookrats.db BOOKRATS_WEB_DIST=../web/dist
uv run bookrats add-user --name Davi --kosync-user davi --kosync-password <pw>
uv run bookrats add-user --name Colega --goodreads-id <id>
uv run bookrats new-reading --title "Duna" --author "Frank Herbert"
uv run uvicorn bookrats.asgi:app --port 8000   # open http://localhost:8000/app/ and paste a token
```

## Not done yet (needs the user / a device)
1. Deploy on the homelab with Tailscale Funnel (see README "Deploy"): auth key → `deploy/.env` `TS_AUTHKEY`, `docker compose -f deploy/docker-compose.yml up -d --build`, create users with `deploy/bookrats add-user …` (wrapper around `docker compose exec`). Public URL: `https://bookrats.<tailnet>.ts.net`. Registration from KOReader is disabled by design; use Login.
2. Configure readers: KOReader custom sync server; CrossPoint Settings → System → KOReader Sync (URL, document matching **Binary** on both devices, server type **Other**; CrossPoint sync is manual).
3. Colleague: public Goodreads profile, progress updates in %; replace `backend/tests/fixtures/goodreads_updates.xml` (partly synthesized %) with his real feed and re-check the regexes.
4. iPhone: install Scriptable, paste `widgets/scriptable/bookrats.js`, set `BASE` and `TOKEN` (see `widgets/scriptable/README.md`); untested on device.
5. Android: build the APK on a machine with the Android SDK or via EAS (`mobile/README.md`); verify widget bars (fractional flex), tap refresh, keyboard behaviour (`KeyboardAvoidingView behavior="height"` may double-compensate).

## Known minor follow-ups (non-blocking)
- Shelf 40ms neighbour "wave" delay is neutralised by the cover fade transition.
- Session `group_sessions` (backend/src/bookrats/sessions.py) was written by the user; gap = 1800 s.
