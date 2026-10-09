# Bookrats Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web dashboard (PWA), iPhone widget (Scriptable) and Android widget (APK) that show both readers' progress and last session from `/api/summary`.

**Architecture:** All three are thin readers of the backend's `/api/*` contract (see `2026-10-08-bookrats-backend.md`, Task 5). The web build is served by FastAPI under `/app` (same origin, no CORS). Widgets authenticate with the per-user bearer token printed by `bookrats add-user`.

**Tech Stack:** React 19 + Vite + TypeScript + Vitest; Scriptable (iOS JavaScript); Expo + `react-native-android-widget`.

**Spec:** `docs/superpowers/specs/2026-10-08-bookrats-design.md`

**Prerequisite:** backend plan complete and reachable at `https://bookrats.<domain>`.

## Global Constraints

- Percent shown as integer, rounded: `Math.round(p * 100) + "%"`.
- Session text format (all clients, pt-BR): `"34% → 41%"`; staleness text: `"há 5 min"`, `"há 3 h"`, `"há 2 dias"`; no data: `"sem dados"`.
- Reader order and colors fixed: first reader `#2F6FEB`, second `#D9480F` (both legible on light and dark).
- Token storage: web `localStorage["bookrats.token"]`; Scriptable constants at top of script; Android `expo-secure-store`.
- Android widget refresh: `updatePeriodMillis = 1800000` (Android minimum) plus refresh on tap.
- Scriptable refresh: `widget.refreshAfterDate = now + 15 min`.

## Review Focus

- Network down or backend 5xx → widget keeps showing last known values with a "desatualizado" mark instead of an error screen (Scriptable: cache last JSON in `FileManager.local()`; Android: keep last rendered state).
- Token wrong/expired → web returns to token screen; widgets show "token inválido", not a blank widget.
- No active reading (`reading: null`) → all clients show "Nenhuma leitura ativa".
- Reader with `percentage: null` → bar empty, text "sem dados".
- Long book titles → truncated with ellipsis on one line in widgets.

---

## File Structure

```
web/
  package.json vite.config.ts (base: "/app/") index.html public/manifest.webmanifest public/icon-192.png public/icon-512.png
  src/
    api.ts        fetch wrappers + types
    format.ts     pct(), sessionText(), ago()
    format.test.ts
    App.tsx       token gate + routes
    Dashboard.tsx DualBar + last sessions + history
    Manage.tsx    manual progress, new reading, link unlinked documents
widgets/scriptable/bookrats.js
mobile/           Expo app (config screen + widget)
  src/format.ts   copy of web/src/format.ts (kept in sync by hand; 3 tiny functions)
  src/widget/BookratsWidget.tsx
  src/widget/handler.ts
backend/src/bookrats/main.py   mount web/dist at /app
```

---

### Task 1: Web formatting helpers and API client

**Files:**
- Create: `web/` (via `npm create vite@latest web -- --template react-ts`), `web/src/format.ts`, `web/src/format.test.ts`, `web/src/api.ts`

**Interfaces:**
- Produces:
  - `pct(p: number | null): string` → `"41%"` or `"sem dados"`
  - `sessionText(s: {from: number, to: number} | null): string` → `"34% → 41%"` or `""`
  - `ago(iso: string | null, now: Date = new Date()): string`
  - types `Summary`, `Reader`, `SessionOut` mirroring the backend JSON
  - `getSummary(token): Promise<Summary>`, `getSessions(token, user, limit=20)`, `postProgress(token, percentage)`, `createReading(token, body)`, `getUnlinked(token)`, `linkDocument(token, hash, readingId)` — all throw `AuthError` on 401

- [ ] **Step 1: Failing tests in `format.test.ts`:**

```ts
test("pct", () => { expect(pct(0.414)).toBe("41%"); expect(pct(null)).toBe("sem dados"); });
test("sessionText", () => expect(sessionText({ from: 0.34, to: 0.41 })).toBe("34% → 41%"));
test("ago", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  expect(ago("2026-10-08T11:55:00Z", now)).toBe("há 5 min");
  expect(ago("2026-10-08T09:00:00Z", now)).toBe("há 3 h");
  expect(ago("2026-10-06T12:00:00Z", now)).toBe("há 2 dias");
  expect(ago(null, now)).toBe("sem dados");
});
```

- [ ] **Step 2: `npx vitest run` — FAIL. Implement. Run — PASS.**
- [ ] **Step 3: Commit `feat(web): format helpers and api client`.**

---

### Task 2: Web screens and backend mount

**Files:**
- Create: `web/src/App.tsx`, `web/src/Dashboard.tsx`, `web/src/Manage.tsx`, `web/public/manifest.webmanifest`, icons
- Modify: `backend/src/bookrats/main.py` (mount `StaticFiles(directory=<web/dist>, html=True)` at `/app` when the directory exists), `backend/Dockerfile` (multi-stage: node build of `web/` copied into image) and `deploy/docker-compose.yml` (build context must become the repo root, `dockerfile: backend/Dockerfile`, since `web/` is outside `backend/`)

**Interfaces:**
- Consumes: Task 1 functions.

- [ ] **Step 1: `App.tsx`: if no token in localStorage, show input "Cole seu token" and save; on `AuthError` clear it. Two tabs: Progresso, Gerenciar.**
- [ ] **Step 2: `Dashboard.tsx`: book title; one bar track with two markers/fills (one per reader, colors from Global Constraints, label `name pct`); under each reader `sessionText(last_session)` + `ago(updated_at)`; history list from `getSessions` for each reader. Poll summary every 60 s while visible.**
- [ ] **Step 3: `Manage.tsx`: slider/number 0–100 → `postProgress(p/100)`; form new reading (title, author, goodreads book id); list unlinked documents (title if present else short hash, last device, first seen) — includes Goodreads editions as `gr:<book_id>` with last device "goodreads" with button "É este livro" → `linkDocument(hash, reading.id)`.**
- [ ] **Step 4: Manifest: `name: "Bookrats"`, `start_url: "/app/"`, `display: "standalone"`, theme color `#2F6FEB`.**
- [ ] **Step 5: Verify: `npm run build`, run backend, open `http://localhost:8000/app/` with a seeded token; create reading, link a KOReader document, post manual progress for the colleague token; dashboard shows both bars and session texts. On iPhone Safari "Adicionar à Tela de Início" opens standalone.**
- [ ] **Step 6: Commit `feat(web): dashboard and management screens served at /app`.**

---

### Task 3: Scriptable widget (iPhone)

**Files:**
- Create: `widgets/scriptable/bookrats.js`, `widgets/scriptable/README.md`

**Interfaces:**
- Consumes: `GET /api/summary` with `Authorization: Bearer`.

- [ ] **Step 1: Script header constants `const BASE = "https://bookrats.<domain>"; const TOKEN = "";`. Copy `pct`, `sessionText`, `ago` from `web/src/format.ts` (plain JS).**
- [ ] **Step 2: `loadSummary()`: `new Request(BASE + "/api/summary")`, headers set, `loadJSON()`; on success write JSON to `FileManager.local()` cache file `bookrats.json`; on failure read cache and set `stale = true`; on 401 (`req.response.statusCode`) render "token inválido".**
- [ ] **Step 3: `buildWidget(summary, stale)`: `ListWidget`; title line (book, `lineLimit = 1`); per reader a bar image drawn with `DrawContext` (width 280, height 8, track gray, fill reader color) and a text row `Davi 41% · 34% → 41% · há 5 min`; footer "desatualizado" when stale. Small family: only two bars + percents. `refreshAfterDate` per Global Constraints. If `config.runsInWidget` → `Script.setWidget`, else `widget.presentMedium()`.**
- [ ] **Step 4: README: install Scriptable, new script, paste, fill token, add Scriptable widget (medium), choose script.**
- [ ] **Step 5: Verify on iPhone: medium and small widgets render; airplane mode → widget still shows values with "desatualizado".**
- [ ] **Step 6: Commit `feat(widgets): scriptable iphone widget`.**

---

### Task 4: Android widget (Expo APK)

**Files:**
- Create: `mobile/` (`npx create-expo-app mobile --template blank-typescript`), `mobile/src/format.ts`, `mobile/src/widget/BookratsWidget.tsx`, `mobile/src/widget/handler.ts`, `mobile/App.tsx`, `mobile/index.ts`
- Modify: `mobile/app.json` (plugin `react-native-android-widget` with widget `name: "Bookrats"`, `minWidth: "250dp"`, `minHeight: "110dp"`, `updatePeriodMillis: 1800000`, `resizeMode: "horizontal|vertical"`)

**Interfaces:**
- Consumes: `GET /api/summary`; `format.ts` copied from web.
- Produces: `BookratsWidget({summary, stale, error}: {summary: Summary | null, stale: boolean, error?: string})` (widget JSX using `FlexWidget`/`TextWidget`); `widgetTaskHandler(props)` handling `WIDGET_ADDED`, `WIDGET_UPDATE`, `WIDGET_CLICK` (click = refresh).

- [ ] **Step 1: `App.tsx` config screen: fields base URL and token saved with `expo-secure-store`; button "Testar" calls summary and shows reader names; button "Atualizar widget" calls `requestWidgetUpdate`.**
- [ ] **Step 2: `handler.ts`: read URL/token from secure store, fetch summary, cache last JSON in secure store key `last`; on failure render cached with `stale`; on 401 render error "token inválido"; no config → "Abra o app para configurar".**
- [ ] **Step 3: `BookratsWidget.tsx`: same content as Scriptable medium widget; bars as two nested `FlexWidget`s with width proportional to percentage; whole widget `clickAction="REFRESH"`.**
- [ ] **Step 4: `index.ts`: `registerWidgetTaskHandler(widgetTaskHandler)` then `registerRootComponent(App)`.**
- [ ] **Step 5: Build: `npx expo prebuild -p android && cd mobile/android && ./gradlew assembleRelease` (debug keystore acceptable for two users). Install APK, configure, add widget.**
- [ ] **Step 6: Verify: widget shows both readers; tap refreshes; mobile data off → cached values + "desatualizado".**
- [ ] **Step 7: Commit `feat(widgets): android widget app`.**

---

### Task 5: Book covers

**Files:**
- Modify: `backend/src/bookrats/db.py` (readings.cover_url TEXT, added by guarded ALTER for existing DBs), `backend/src/bookrats/store.py`, `backend/src/bookrats/api.py`, `backend/src/bookrats/cli.py` (`--cover-url`)
- Create: `backend/src/bookrats/covers.py`, `backend/tests/test_covers.py`
- Modify: `web/src/api.ts`, `web/src/Dashboard.tsx`, `web/src/Manage.tsx`, CSS; `widgets/scriptable/bookrats.js`

**Interfaces:**
- `covers.OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json"`; `async covers.find_cover(client: httpx.AsyncClient, title: str, author: str | None) -> str | None` — GET search.json?title=&author=&limit=5&fields=cover_i,title; first doc with `cover_i` → `https://covers.openlibrary.org/b/id/{cover_i}-L.jpg`; any httpx error, timeout (5 s) or no match → None.
- `store.create_reading(..., cover_url=None)`; `store.set_cover(conn, reading_id, cover_url) -> None` (KeyError if unknown).
- `POST /api/readings` body adds optional `cover_url`; when absent, the route awaits `find_cover` (client from `app.state.http`, created in lifespan; tests inject a MockTransport client).
- `PATCH /api/readings/{id}` body `{"cover_url": str | null}` → 204; 404 unknown.
- `/api/summary` → `reading.cover_url: string | null`.
- Web: Dashboard hero shows the cover (2:3 aspect, 16px radius, tinted shadow, `loading="eager"`, alt = title) beside title/author on ≥480px and above them on narrow screens; no cover → a typographic placeholder tile with the title initials in the first reader's blue (no image). Manage: field "URL da capa (opcional)" in "Nova leitura", plus "Trocar capa" on the active reading → PATCH.
- Scriptable: medium/large show the cover at left (loaded with `Request.loadImage`, cached to FileManager by URL; failure → no image).
- Android widget: cover deferred.

Tests: backend — find_cover hit/miss/HTTP error with MockTransport; POST without cover_url stores resolved URL; POST with cover_url skips lookup; PATCH 204/404; summary includes cover_url. Web — Dashboard renders img with alt=title when cover_url present, placeholder when null; Manage PATCH call.

---

### Task 6: Per-reader bar color

**Decision (user request 2026-10-09):** each user picks the color of their own bar from a curated palette; the two readers may not share a color.

**Palette (id → light-theme hex / dark-theme hex, all ≥3:1 against their track and background in both themes):**
`azul #2F6FEB/#6F9CF5`, `laranja #D9480F/#FF8A4C`, `verde #2B8A3E/#51CF66`, `roxo #7048E8/#9775FA`, `rosa #D6336C/#F06595`, `ciano #0C8599/#3BC9DB`, `ambar #B76E00/#FCC419`, `grafite #495057/#ADB5BD`.
Defaults: user id order → azul, laranja.

**Files:**
- Backend: `db.py` (users.color TEXT, guarded ALTER), `store.py` (`set_color(conn, user_id, color_id)`), `api.py`, new `backend/src/bookrats/palette.py` (`PALETTE: dict[str, tuple[str, str]]`, `DEFAULT_ORDER = ["azul", "laranja"]`).
- Web: `api.ts` (Reader.color: {id, light, dark}; `setColor(token, colorId)`), `Dashboard.tsx` (bars/dots use the reader's color via CSS custom properties `--c-light/--c-dark`), `Manage.tsx` (new card "Cor da minha barra": radio group of swatches, the other reader's color disabled with label "em uso por <nome>"), CSS.
- Widgets: Scriptable and Android use `reader.color` (dark/light per appearance; Android widget uses the dark value), falling back to the fixed defaults when absent.

**Interfaces:**
- `/api/summary` → each reader gains `"color": {"id": "azul", "light": "#2F6FEB", "dark": "#6F9CF5"}` (never null: falls back to the default for that position).
- `GET /api/palette` → `[{"id", "light", "dark"}]` in palette order.
- `PUT /api/me/color` body `{"color": "<id>"}` → 204; 422 unknown id; 409 `{"detail": "cor em uso"}` when the other user already has it.

Tests: backend — defaults when unset, set/get roundtrip, unknown id 422, conflict 409, palette endpoint order, summary shape, schema upgrade adds the column. Web — dashboard applies the reader color variables; Manage swatch selection calls setColor, other reader's color disabled, error 409 shown inline. Mobile — state.ts uses reader.color.dark with fallback. Scriptable — reviewed by reading.

---

### Task 7: Switching readings

**Decision (user 2026-10-09):** one active reading at a time; the user can switch back to any previous reading and edit readings. Starting a new book from an incoming document is one tap.

**Backend interfaces:**
- `GET /api/readings` → `[{"id","title","author","cover_url","goodreads_book_id","active": bool,"created_at": ISO,"readers":[{"name","percentage": float|null,"updated_at": ISO|null}]}]`, active first, then by most recent progress (fallback created_at) descending. Percentages = each user's latest snapshot for that reading.
- `POST /api/readings/{id}/activate` → 204; makes it the only active reading; 404 unknown.
- `PATCH /api/readings/{id}` body any subset of `{"title","author","goodreads_book_id","cover_url"}` → 204 (replaces the cover-only PATCH; same cover_url validation; title non-empty, ≤200 chars; when goodreads_book_id changes and a "gr:<id>" document exists it is linked to this reading).
- `POST /api/documents/{hash}/start` body `{}` → 201 `{"id"}`: creates a reading from the document's title/authors (422 if the document has no title), links the document, resolves the cover like POST /api/readings, and activates it. For "gr:<id>" documents it also sets goodreads_book_id.
- `store.activate_reading`, `store.update_reading`, `store.list_readings`.

**Web:**
- Manage gets a card "Minhas leituras" listing readings: cover thumb (2:3, 48px), title, author, each reader's last pct as small dots+numbers, "Atual" badge on the active one; others have "Retomar" (POST activate, then refresh summary). Each row has "Editar" opening an inline form (title, author, Goodreads ID, cover URL) → PATCH.
- "Documentos sem leitura": rows with a title get a primary "Começar a ler este" plus the existing "É este livro" (secondary). Rows without title keep only "É este livro".
- After switching, the Dashboard shows the new active reading (widgets follow automatically through /api/summary).

**Tests:** backend — list order and per-reader pct; activate switches the single active; PATCH partial updates, validation, goodreads relink; start from titled kosync doc and from gr: doc; 422 without title; 404s; auth. Web — list renders, Retomar calls activateReading and refreshes, Editar submits PATCH with only changed fields, "Começar a ler este" visible only for titled documents and calls startFromDocument.

**Task 7 amendment (user 2026-10-09: "quero um histórico, quero me lembrar dos livros que li com meu colega"):**
- GET /api/readings per reader adds `started_at` (first snapshot) and `finished_at` (first snapshot with percentage ≥ 0.99), both ISO or null; reading gains `status`: "lendo" | "lido" | "pausado".
- The list UI moves from a Manage card to a new tab "Estante" (tabs: Progresso, Estante, Gerenciar): `Shelf({token})` cover grid with status labels; detail dialog with per-reader start/finish dates (dd/mm/aaaa), "Leu em N dias", "<nome> terminou primeiro", "Retomar" (non-active) and "Editar".

---

### Task 8: Simpler color picker with custom colors

**Decision (user 2026-10-09):** the swatch grid is buggy and ugly. Replace with: two circles (one per friend, name below); only your own circle is interactive; tapping it opens a popover with one row of preset swatches plus a final "+" option that opens the native color picker (`<input type="color">`) for any color.

**Backend:** `PUT /api/me/color` accepts a palette id OR a hex `#rrggbb` (case-insensitive, stored lowercase); 422 otherwise. Summary color for a custom hex: `{"id": "custom", "light": "#rrggbb", "dark": <derived>}` where dark = the hex lightened in HSL steps until contrast ≥ 3:1 against the dark track `#313137` (unchanged if already ≥ 3:1); light likewise darkened until ≥ 3:1 against the light track `#e4e4e7`. Conflict (409 "cor em uso") only when the effective light hex equals the other user's effective light hex (palette ids resolve to their light hex). `GET /api/palette` unchanged.

**Web:** Manage card "Cores": two 48px circles with name below (yours first, labelled "Você"/your name), your circle is a button with aria-haspopup="dialog" and aria-expanded; popover anchored below it with a caret, one row of the 8 preset swatches (36px, the other friend's current color disabled with a diagonal strike and title "Em uso por <nome>"), the selected one with a check, and a last "+" swatch that triggers the native color input; choosing applies immediately (PUT) and closes; Esc/click outside closes; focus returns to your circle. No text labels per swatch (aria-label only). 409 → small inline message under the circles "Essa cor já está em uso".

---

### Task 9: React folder structure + Tailwind v4 migration

**Decision (user 2026-10-09):** organize web/src in the usual React layout and migrate styling to Tailwind v4 with a `styles/` folder holding all Tailwind configuration. Behaviour-preserving refactor: the existing test suite is the safety net; class names asserted by tests (`is-animating`, `is-advanced`, `is-custom-active`, `.sr-only`) and data-testids stay.

**Layout:**
```
web/src/
  main.tsx, App.tsx
  api/client.ts, api/types.ts            (from api.ts)
  lib/format.ts
  hooks/useCountUp.ts
  components/<Name>/<Name>.tsx + .test.tsx   (Cover, ProgressBar, HistoryPanel, ColorPicker, Tabs, LogoutButton, Dialog…)
  pages/Dashboard/, pages/Shelf/, pages/Manage/  (page + its tests)
  styles/tailwind.css   (@import "tailwindcss"; imports below; entry imported once in main.tsx)
  styles/theme.css      (@theme: colors incl. light/dark tokens, reader palette vars, font family Geist, type scale --text-*, radii, shadows, easing, durations)
  styles/base.css       (@layer base: html/body, scrollbar-gutter, focus-visible ring, reduced-motion defaults)
  styles/animations.css (@layer components/utilities + @keyframes: shimmer, spinner, collapse grid-rows, glow/sweep, magnification with :has, popover fade)
  test/setup.ts, test/fixtures.ts
```
**Rules:** Tailwind v4 via `@tailwindcss/vite`; no tailwind.config.js (CSS-first config in styles/theme.css); dark mode via the default `prefers-color-scheme` variant; reader colors through CSS variables (`--c-light/--c-dark`) used as `bg-(--c)`-style arbitrary values; components use utilities, complex selectors stay in animations.css; delete the old index.css/App.css/logout.css/shelf-*.css after migration; no visual change (verified by before/after screenshots at 390×844 and 1280×800 in light and dark for Progresso, Estante, Gerenciar, popover open, dialog open).
