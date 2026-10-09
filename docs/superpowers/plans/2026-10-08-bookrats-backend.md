# Bookrats Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A FastAPI service on the homelab that acts as a kosync server, polls Goodreads, computes reading sessions and serves `/api/summary` — usable end to end with `curl` and a real KOReader before any client exists.

**Architecture:** One Python package, SQLite via stdlib `sqlite3`, one module per responsibility. kosync and the app API are two routers on the same app. Goodreads polling is an asyncio task started in the app lifespan. Session grouping is a pure function over snapshots.

**Tech Stack:** Python 3.12, uv, FastAPI, uvicorn, httpx, feedparser, pytest. Docker Compose + `cloudflare/cloudflared`.

**Spec:** `docs/superpowers/specs/2026-10-08-bookrats-design.md`

**Follow-up plan:** `docs/superpowers/plans/2026-10-08-bookrats-clients.md` (web, Scriptable, Android) consumes the `/api/*` contract defined here.

## Global Constraints

- Python ≥ 3.12; dependencies limited to fastapi, uvicorn, httpx, feedparser (+ pytest dev).
- Percentages stored as REAL 0.0–1.0; never store integer percent.
- Timestamps stored as integer Unix seconds UTC; API emits ISO-8601 UTC strings.
- Session gap threshold: 1800 seconds.
- Goodreads poll interval default: 900 seconds (`BOOKRATS_GOODREADS_POLL_SECONDS`).
- kosync responses use content type `application/vnd.koreader.v1+json`-compatible JSON; clients send `x-auth-user` / `x-auth-key` (key = md5 hex of password, stored as received).
- No open sign-up: `POST /users/create` always refuses.
- kosync PUT bodies may carry extra fields (CrossPoint sends `metadata: {filename, title, authors, ...}` and `position: {...}`); unknown fields are ignored, never rejected. `metadata.title`/`authors` are stored on `documents` when present.
- CrossPoint also sends `Authorization: Basic ...` on kosync calls; kosync auth uses only `x-auth-user`/`x-auth-key`.
- Config only via env: `BOOKRATS_DB` (default `./bookrats.db`), `BOOKRATS_GOODREADS_POLL_SECONDS`.

## Review Focus

- KOReader sends `percentage` as a string or > 1.0 in edge cases → reject with 400, never store out-of-range values.
- Two devices of the same user push different percentages for the same book minutes apart (Kindle vs Xteink) → current progress = latest snapshot by timestamp, session `to` uses latest, not max.
- Same Goodreads RSS item seen on every poll → stored once (dedupe by item guid).
- kosync document hash not linked to any reading → stored and listed as unlinked, not dropped; snapshots attach to the reading retroactively once linked.
- `/api/summary` with no active reading or a reader with zero snapshots → 200 with `null` fields, never 500.

---

## File Structure

```
backend/
  pyproject.toml
  Dockerfile
  src/bookrats/
    config.py      Settings from env
    db.py          connect(), init_schema()
    store.py       all SQL: users, readings, documents, snapshots, goodreads guids
    sessions.py    group_sessions() pure function
    kosync.py      kosync router
    goodreads.py   parse_updates(), poll_once(), poll_forever()
    api.py         app router (/api/*)
    main.py        create_app()
    cli.py         add-user, new-reading
  tests/
    conftest.py    tmp db + TestClient fixtures
    fixtures/goodreads_updates.xml
    test_store.py test_sessions.py test_kosync.py test_goodreads.py test_api.py
deploy/
  docker-compose.yml
  .env.example
```

## Schema (db.py)

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  kosync_username TEXT UNIQUE, kosync_key TEXT,
  goodreads_user_id TEXT, api_token TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT,
  goodreads_book_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS documents (
  hash TEXT PRIMARY KEY, reading_id INTEGER REFERENCES readings(id),
  first_seen INTEGER NOT NULL, last_device TEXT, title TEXT, authors TEXT);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  source TEXT NOT NULL CHECK (source IN ('kosync','goodreads','manual')),
  document TEXT, reading_id INTEGER REFERENCES readings(id),
  percentage REAL NOT NULL CHECK (percentage BETWEEN 0 AND 1),
  progress TEXT, device TEXT, device_id TEXT, ts INTEGER NOT NULL, external_id TEXT UNIQUE);
```

`snapshots.reading_id` is set directly for goodreads/manual; for kosync it is resolved through `documents` at query time (so linking later is retroactive).

---

### Task 1: Project skeleton, schema and store

**Files:**
- Create: `backend/pyproject.toml`, `backend/src/bookrats/{__init__,config,db,store,main}.py`, `backend/tests/conftest.py`, `backend/tests/test_store.py`, `.gitignore`

**Interfaces:**
- Produces:
  - `db.connect(path: str) -> sqlite3.Connection` (row_factory = Row, foreign keys on, calls `init_schema`)
  - `store.User` dataclass `(id, name, kosync_username, kosync_key, goodreads_user_id, api_token)`
  - `store.Snapshot` dataclass `(user_id, percentage, ts, source, device, document)`
  - `store.add_user(conn, name, api_token, kosync_username=None, kosync_key=None, goodreads_user_id=None) -> User`
  - `store.user_by_kosync(conn, username, key) -> User | None`
  - `store.user_by_token(conn, token) -> User | None`
  - `store.list_users(conn) -> list[User]`
  - `store.create_reading(conn, title, author=None, goodreads_book_id=None) -> int` (deactivates any other active reading)
  - `store.active_reading(conn) -> sqlite3.Row | None`
  - `store.add_snapshot(conn, user_id, source, percentage, ts, *, document=None, reading_id=None, progress=None, device=None, device_id=None, external_id=None, title=None, authors=None) -> bool` (False if `external_id` already exists; raises `ValueError` if percentage not in [0,1])
  - `store.link_document(conn, hash, reading_id) -> None` (raises `KeyError` if hash unknown)
  - `store.unlinked_documents(conn) -> list[sqlite3.Row]`
  - `store.snapshots_for(conn, user_id, reading_id) -> list[Snapshot]` ordered by ts asc, including kosync snapshots whose document links to the reading
  - `store.latest_kosync(conn, user_id, document) -> sqlite3.Row | None`
  - `main.create_app(db_path: str, start_poller: bool = True) -> FastAPI`
  - fixtures `conn`, `client` (TestClient on `create_app(tmp, start_poller=False)`), `davi`, `colega` (users with tokens `"t-davi"`, `"t-colega"`; davi has kosync `("davi", "md5x")`, colega has `goodreads_user_id="123"`)

- [ ] **Step 1: `uv init --package backend`, add deps fastapi uvicorn httpx feedparser, dev dep pytest; `.gitignore` with `.venv`, `*.db`, `__pycache__`, `node_modules`, `.env`.**
- [ ] **Step 2: Write failing tests in `tests/test_store.py`:**

```python
def test_add_snapshot_rejects_out_of_range(conn, davi):
    with pytest.raises(ValueError):
        store.add_snapshot(conn, davi.id, "manual", 1.2, 100)

def test_external_id_dedupes(conn, colega):
    assert store.add_snapshot(conn, colega.id, "goodreads", 0.3, 100, external_id="g1") is True
    assert store.add_snapshot(conn, colega.id, "goodreads", 0.3, 100, external_id="g1") is False

def test_linking_is_retroactive(conn, davi):
    r = store.create_reading(conn, "Duna")
    store.add_snapshot(conn, davi.id, "kosync", 0.1, 100, document="h1")
    assert store.snapshots_for(conn, davi.id, r) == []
    with pytest.raises(KeyError):
        store.link_document(conn, "unknown", r)
    store.link_document(conn, "h1", r)
    assert [s.percentage for s in store.snapshots_for(conn, davi.id, r)] == [0.1]

def test_create_reading_deactivates_previous(conn):
    store.create_reading(conn, "A"); b = store.create_reading(conn, "B")
    assert store.active_reading(conn)["id"] == b
```

- [ ] **Step 3: Run `uv run pytest tests/test_store.py` — expect FAIL (import errors).**
- [ ] **Step 4: Implement `db.py` with the schema above and `store.py`. `add_snapshot` inserts the document into `documents` (first_seen, last_device) with `INSERT ... ON CONFLICT DO UPDATE SET last_device`. `create_app` builds the app with `app.state.db_path` and an empty router set.**
- [ ] **Step 5: Run tests — expect PASS.**
- [ ] **Step 6: Commit `feat: backend skeleton, schema and store`.**

---

### Task 2: Session grouping

**Files:**
- Create: `backend/src/bookrats/sessions.py`, `backend/tests/test_sessions.py`

**Interfaces:**
- Consumes: `store.Snapshot`
- Produces: `sessions.Session` dataclass `(start_pct: float, end_pct: float, started_at: int, ended_at: int)`; `sessions.group_sessions(snaps: list[Snapshot], gap: int = 1800) -> list[Session]` (input ordered by ts; output ordered oldest first)

- [ ] **Step 1: Write failing tests:**

```python
def S(p, ts): return Snapshot(user_id=1, percentage=p, ts=ts, source="kosync", device=None, document="h")

def test_empty(): assert group_sessions([]) == []
def test_single_snapshot_session_from_equals_to():
    assert group_sessions([S(.2, 0)]) == [Session(.2, .2, 0, 0)]
def test_gap_splits_and_from_is_previous_end():
    out = group_sessions([S(.10, 0), S(.15, 600), S(.20, 600 + 1801), S(.25, 3000)])
    assert out == [Session(.10, .15, 0, 600), Session(.15, .25, 2401, 3000)]
def test_exactly_gap_stays_same_session():
    assert len(group_sessions([S(.1, 0), S(.2, 1800)])) == 1
def test_to_uses_latest_not_max():  # two devices disagree
    assert group_sessions([S(.40, 0), S(.38, 60)])[0].end_pct == .38
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `group_sessions`. A new session starts when `ts - prev.ts > gap`. `start_pct` = previous session's `end_pct`, or the first snapshot's percentage for the first session. (Good candidate for a human-written function — leave a `TODO(human)` during execution.)**
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit `feat: session grouping`.**

---

### Task 3: kosync server API

**Files:**
- Create: `backend/src/bookrats/kosync.py`, `backend/tests/test_kosync.py`
- Modify: `backend/src/bookrats/main.py` (include router at root)

**Interfaces:**
- Consumes: `store.user_by_kosync`, `store.add_snapshot`, `store.latest_kosync`
- Produces (HTTP, mirrors koreader-sync-server):
  - `POST /users/create` → 402 `{"code": 2005, "message": "User registration is disabled."}`
  - `GET /users/auth` → 200 `{"authorized": "OK"}` / 401 `{"code": 2001, "message": "Unauthorized"}`
  - `PUT /syncs/progress` body `{document, progress, percentage, device, device_id}` → 200 `{"document", "timestamp"}`; 400 `{"code": 2003, "message": "Invalid request"}` on bad body
  - `GET /syncs/progress/{document}` → 200 `{document, progress, percentage, device, device_id, timestamp}` or `{}`
  - `GET /healthcheck` → `{"state": "OK"}`

- [ ] **Step 1: Write failing tests (headers `H = {"x-auth-user": "davi", "x-auth-key": "md5x"}`):**

```python
def test_auth_ok(client, davi): assert client.get("/users/auth", headers=H).json() == {"authorized": "OK"}
def test_auth_bad(client, davi): assert client.get("/users/auth", headers={**H, "x-auth-key": "no"}).status_code == 401
def test_register_disabled(client): assert client.post("/users/create", json={"username": "x", "password": "y"}).status_code == 402
def test_put_then_get_roundtrip(client, davi):
    body = {"document": "h1", "progress": "/body/DocFragment[3]", "percentage": 0.42, "device": "Kindle", "device_id": "k1"}
    assert client.put("/syncs/progress", json=body, headers=H).status_code == 200
    got = client.get("/syncs/progress/h1", headers=H).json()
    assert got["percentage"] == 0.42 and got["progress"] == "/body/DocFragment[3]"
def test_put_rejects_bad_percentage(client, davi):
    assert client.put("/syncs/progress", json={"document": "h1", "progress": "x", "percentage": 1.5, "device": "d", "device_id": "d"}, headers=H).status_code == 400
def test_get_unknown_document_is_empty(client, davi): assert client.get("/syncs/progress/zz", headers=H).json() == {}
def test_put_accepts_crosspoint_extensions(client, conn, davi):
    body = {"document": "h2", "progress": "x", "percentage": 0.1, "device": "CrossPoint", "device_id": "crosspoint-reader",
            "metadata": {"filename": "duna.epub", "title": "Duna", "authors": "Frank Herbert"}, "position": {"pctQ": 1, "spine": 2}}
    assert client.put("/syncs/progress", json=body, headers=H).status_code == 200
    assert conn.execute("select title from documents where hash='h2'").fetchone()[0] == "Duna"
def test_put_stores_history(client, conn, davi):
    for p in (0.1, 0.2):
        client.put("/syncs/progress", json={"document": "h1", "progress": "x", "percentage": p, "device": "d", "device_id": "d"}, headers=H)
    assert conn.execute("select count(*) from snapshots where document='h1'").fetchone()[0] == 2
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement router. Auth as a FastAPI dependency reading the two headers. Pydantic body model with `percentage: float = Field(ge=0, le=1)`, `progress: str`, `document: str`, `device: str`, `device_id: str`; validation errors on this router return the 400 kosync error (catch in the route via a manual `model_validate` on the raw JSON, so the app-wide 422 handler stays untouched). GET returns the row from `store.latest_kosync`, `timestamp` = `ts`.**
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Manual check: `uv run uvicorn bookrats.main:app` (module-level `app = create_app(settings.db)`), seed user with Task 6 CLI or a Python one-liner, point KOReader on the LAN to `http://<ip>:8000`, Login, turn pages, run "Push progress"; `sqlite3 bookrats.db 'select * from snapshots'` shows rows.**
- [ ] **Step 6: Commit `feat: kosync server API`.**

---

### Task 4: Goodreads updates polling

**Files:**
- Create: `backend/src/bookrats/goodreads.py`, `backend/tests/test_goodreads.py`, `backend/tests/fixtures/goodreads_updates.xml`
- Modify: `backend/src/bookrats/main.py` (lifespan starts `poll_forever` when `start_poller`)

**Interfaces:**
- Consumes: `store.list_users`, `store.add_snapshot`
- Produces:
  - `goodreads.Update` dataclass `(guid: str, book_id: str | None, percentage: float, ts: int)`
  - `goodreads.parse_updates(xml: str) -> list[Update]` — only progress items; others ignored
  - `goodreads.FEED_URL = "https://www.goodreads.com/user/updates_rss/{user_id}"`
  - `async goodreads.poll_once(conn, client: httpx.AsyncClient) -> int` (new snapshots stored)
  - `async goodreads.poll_forever(db_path: str, interval: int) -> None`

- [ ] **Step 1: Capture the real feed: once the colleague's profile is public and he has posted at least one % update and one page update, `curl -s "https://www.goodreads.com/user/updates_rss/<id>" > tests/fixtures/goodreads_updates.xml`. Read it and note the exact item title/description wording for "% done" and "page X of Y" and where `/book/show/<id>` appears. Fixture wording is the source of truth for the regexes; if it differs from the assumptions below, follow the fixture.**
- [ ] **Step 2: Write failing tests against the fixture, asserting exact values read from it:**

```python
def test_parses_percent_update(): u = by_guid(parse_updates(FIX), "<guid of % item>"); assert u.percentage == 0.34 and u.book_id == "<id>"
def test_parses_page_update_as_ratio(): u = by_guid(parse_updates(FIX), "<guid of page item>"); assert u.percentage == pytest.approx(120/350)
def test_ignores_non_progress_items(): assert all(0 <= u.percentage <= 1 for u in parse_updates(FIX)) and len(parse_updates(FIX)) == <n progress items>
async def test_poll_once_dedupes(conn, colega):
    c = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, text=FIX)))
    assert await poll_once(conn, c) == <n progress items>
    assert await poll_once(conn, c) == 0
async def test_poll_once_attaches_active_reading_by_book_id(conn, colega):
    r = store.create_reading(conn, "X", goodreads_book_id="<id of % item>")
    await poll_once(conn, mock_client(FIX))
    assert [s.percentage for s in store.snapshots_for(conn, colega.id, r)] == [<% values of items with that book id, oldest first>]
```

Use `httpx.MockTransport` for the client (no extra dependency).

- [ ] **Step 3: Run — expect FAIL.**
- [ ] **Step 4: Implement with `feedparser.parse`. `ts` from `published_parsed` (`calendar.timegm`). `external_id = "gr:" + guid`. `reading_id` = active reading id only if its `goodreads_book_id == update.book_id`. `poll_forever` opens its own connection, loops `poll_once` then `asyncio.sleep(interval)`, logs and continues on any `httpx.HTTPError`. Send a normal browser-like `User-Agent`.**
- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit `feat: goodreads progress polling`.**

---

### Task 5: App API (`/api/*`)

**Files:**
- Create: `backend/src/bookrats/api.py`, `backend/tests/test_api.py`
- Modify: `backend/src/bookrats/main.py` (include router with prefix `/api`; no CORS — web is served same-origin under `/app`, widgets are not browsers)

**Interfaces:**
- Consumes: `store.*`, `sessions.group_sessions`
- Produces (all require `Authorization: Bearer <api_token>`, 401 otherwise):
  - `GET /api/summary` →
    ```json
    {"reading": {"id": 1, "title": "Duna", "author": "Frank Herbert"} | null,
     "me": "Davi",
     "readers": [{"name": "Davi", "percentage": 0.41, "updated_at": "2026-10-08T21:10:00Z", "source": "kosync",
                  "last_session": {"from": 0.34, "to": 0.41, "started_at": "...", "ended_at": "..."} | null}]}
    ```
    `readers` always has both users, ordered by `users.id`; `percentage`/`updated_at`/`source` are `null` with no snapshots.
  - `GET /api/sessions?user=<name>&limit=20` → `[{"from","to","started_at","ended_at"}]` newest first
  - `POST /api/progress` body `{"percentage": 0.0–1.0}` → 201; stores `source="manual"`, `reading_id` = active reading; 409 if no active reading
  - `POST /api/readings` body `{"title", "author"?, "goodreads_book_id"?}` → 201 `{"id"}`
  - `GET /api/documents/unlinked` → `[{"hash","title","authors","last_device","first_seen"}]` (`title`/`authors` null for KOReader documents)
  - `POST /api/documents/{hash}/link` body `{"reading_id"}` → 204; 404 unknown hash or reading

- [ ] **Step 1: Write failing tests:**

```python
AUTH = {"Authorization": "Bearer t-davi"}
def test_requires_token(client): assert client.get("/api/summary").status_code == 401
def test_summary_without_reading(client, davi, colega):
    j = client.get("/api/summary", headers=AUTH).json()
    assert j["reading"] is None and [r["percentage"] for r in j["readers"]] == [None, None]
def test_summary_latest_and_last_session(client, conn, davi, colega):
    r = store.create_reading(conn, "Duna")
    for p, ts in [(.30, 0), (.34, 600), (.36, 5000), (.41, 5600)]:
        store.add_snapshot(conn, davi.id, "kosync", p, ts, document="h1")
    store.link_document(conn, "h1", r)
    d = client.get("/api/summary", headers=AUTH).json()["readers"][0]
    assert d["percentage"] == .41 and d["last_session"]["from"] == .34 and d["last_session"]["to"] == .41
def test_manual_progress_needs_reading(client, colega):
    assert client.post("/api/progress", json={"percentage": .2}, headers={"Authorization": "Bearer t-colega"}).status_code == 409
def test_link_unknown_hash_404(client, conn, davi):
    r = store.create_reading(conn, "X"); assert client.post("/api/documents/zz/link", json={"reading_id": r}, headers=AUTH).status_code == 404
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement. Bearer auth as dependency via `store.user_by_token`. Summary computes per user `snaps = store.snapshots_for(...)`, latest = `snaps[-1]`, `last_session = group_sessions(snaps)[-1]`. ISO formatting via `datetime.fromtimestamp(ts, UTC).isoformat().replace("+00:00", "Z")`.**
- [ ] **Step 4: Run all tests `uv run pytest` — expect PASS.**
- [ ] **Step 5: Commit `feat: app api with summary, sessions, manual progress, linking`.**

---

### Task 6: CLI, Docker and Cloudflare Tunnel deploy

**Files:**
- Create: `backend/src/bookrats/cli.py`, `backend/Dockerfile`, `deploy/docker-compose.yml`, `deploy/.env.example`, `README.md`
- Modify: `backend/pyproject.toml` (`[project.scripts] bookrats = "bookrats.cli:main"`)

**Interfaces:**
- Consumes: `store.add_user`, `store.create_reading`
- Produces:
  - `bookrats add-user --name Davi --kosync-user davi --kosync-password <plain>` (stores md5 hex of password, prints generated `api_token` from `secrets.token_urlsafe(24)`)
  - `bookrats add-user --name Colega --goodreads-id 123456`
  - `bookrats new-reading --title "Duna" --author "Frank Herbert" --goodreads-book-id 44767458`

- [ ] **Step 1: Test `tests/test_cli.py`: `main(["add-user", "--name", "D", "--kosync-user", "d", "--kosync-password", "pw"])` then `store.user_by_kosync(conn, "d", hashlib.md5(b"pw").hexdigest())` is not None. Run — FAIL. Implement with argparse. Run — PASS.**
- [ ] **Step 2: Dockerfile: `python:3.12-slim`, install via uv, `CMD uvicorn bookrats.main:app --host 0.0.0.0 --port 8000`, DB at `/data/bookrats.db`.**
- [ ] **Step 3: `docker-compose.yml`: services `bookrats` (build `../backend`, volume `bookrats-data:/data`, env `BOOKRATS_DB=/data/bookrats.db`, no published ports) and `cloudflared` (`cloudflare/cloudflared:latest`, `command: tunnel run`, env `TUNNEL_TOKEN=${TUNNEL_TOKEN}`). `.env.example` lists `TUNNEL_TOKEN=`.**
- [ ] **Step 4: README section "Deploy": create tunnel in Cloudflare Zero Trust → Networks → Tunnels, public hostname `bookrats.<domain>` → service `http://bookrats:8000`; copy token to `deploy/.env`; `docker compose up -d`; seed users with `docker compose exec bookrats bookrats add-user ...`.**
- [ ] **Step 5: Verify from outside the LAN (phone on mobile data): `curl https://bookrats.<domain>/healthcheck` → `{"state":"OK"}`; KOReader custom sync server `https://bookrats.<domain>` → Login OK → Push progress → appears in `GET /api/documents/unlinked`. Repeat on CrossPoint; if CrossPoint has no custom-server option, record it in the spec's risks.**
- [ ] **Step 6: Commit `feat: cli and docker deploy with cloudflare tunnel`.**
