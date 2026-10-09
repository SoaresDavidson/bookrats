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
- Reader order and colors fixed: first reader `#2F6FEB`, second `#E8590C` (both legible on light and dark).
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
