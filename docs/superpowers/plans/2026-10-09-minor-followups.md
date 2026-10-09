# Bookrats — minor follow-ups plan

Spec: `docs/STATUS.md` section "Known minor follow-ups (non-blocking)". Product spec: `docs/superpowers/specs/2026-10-08-bookrats-design.md`.

## Global Constraints
- Match surrounding code style: terse, no new dependencies, pt-BR user-facing strings.
- Backend tests: `cd backend && uv run pytest -q` must pass. Web: `cd web && npx vitest run && npx tsc -b && npm run build`. Mobile: `cd mobile && npx vitest run && npx tsc --noEmit`.
- Covers never guess: only exact or prefix normalized-title matches are accepted (existing rule in `backend/src/bookrats/covers.py`).
- One commit per task, conventional-commit message (`fix(web): …`, `feat(backend): …`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Out of scope: shelf wave delay, deploy, anything needing a device.

### Task 1: Exclude test files from Tailwind scanning

Files: `web/src/styles/tailwind.css`, `web/src/pages/Dashboard/Dashboard.test.tsx`.

- Add `@source not "../**/*.test.{ts,tsx}";` to `web/src/styles/tailwind.css` right after `@import "tailwindcss";`.
- In `Dashboard.test.tsx` line ~127 replace `["col", "lapse"].join("")` with the literal `"collapse"`.
- Verify: `npm run build` then confirm the built CSS has no `.collapse` utility rule triggered by tests: `grep -c '\.collapse{' dist/assets/*.css` must print 0 (or the class must not appear as a standalone selector). Then run the web test suite.

### Task 2: Mobile error handling and handler cache tests

Files: `mobile/App.tsx`, `mobile/src/widget/handler.test.ts`.

- In `App.tsx` `run()`, add a `catch` between `try` and `finally`: on any thrown error set the message (if mounted) to `"Não foi possível concluir. Tente de novo."`. The initial SecureStore read in the mount `useEffect` must also not leave an unhandled rejection: wrap it so failures set the same message.
- In `handler.test.ts` add tests:
  1. corrupt cache (`bookrats.last` = `"{not json"`) with failing fetch → `{ outcome: { kind: "network" }, cached: null }`.
  2. unconfigured (url/token missing) with a valid cache → `{ outcome: { kind: "unconfigured" }, cached: summary }`, and `fetch` is never called.
  3. success path does not read `bookrats.last` (spy on `getItemAsync`; assert no call with `"bookrats.last"`).
- No App.tsx render test (no React Native render harness in this repo).

### Task 3: Specific error messages in Gerenciar

Files: `web/src/api/client.ts`, `web/src/api/client.test.ts`, `web/src/pages/Manage/Manage.tsx`, `web/src/pages/Manage/Manage.test.tsx`.

- `HttpError` gains `detail?: unknown`. `request()` on a non-ok, non-401 response tries `await res.json()` and passes its `detail` field into `HttpError`; parse failure leaves `detail` undefined. Keep `AuthError` unchanged.
- Create reading: the 422 → cover error mapping applies only when `detail` is an array containing an item whose `loc` array includes `"cover_url"`. Other 422s fall through to `guard` (generic message). Shape of FastAPI validation detail: `[{"loc": ["body", "cover_url"], "msg": "...", "type": "..."}]`.
- "Começar a ler este" (`startFromDocument`): on 409 show `"Esse documento já está ligado a uma leitura."` (not the generic error) and refresh the list (`refresh()`), since the list is stale.
- Tests: client test that `HttpError.detail` is populated from a JSON body and undefined for a non-JSON body; Manage tests for (a) 422 with `loc` on `title` shows the generic error, not the cover error; (b) 422 with `loc` on `cover_url` still shows the cover error; (c) 409 on "Começar a ler este" shows the new message.

### Task 4: Serve palette labels from the API

Files: `backend/src/bookrats/api.py`, `backend/tests/test_palette.py`, `web/src/api/types.ts`, `web/src/components/ColorPicker/ColorPicker.tsx` (+ its tests / fixtures that build palette objects).

- `GET /api/palette` entries become `{"id", "label", "light", "dark"}` using `palette.LABELS`. Only the palette endpoint adds `label`; `_color()` used by summary is unchanged.
- Update `test_palette_endpoint_order_and_values` with the labels (`Azul, Laranja, Verde, Roxo, Rosa, Ciano, Âmbar, Grafite`).
- Web: `ColorOption` gets `label?: string`; ColorPicker uses `c.label ?? c.id` and the local `LABELS` constant is deleted. Update web test fixtures that mock `/api/palette` to include labels where tests assert accessible names.

### Task 5: Google Books as second cover source

Files: `backend/src/bookrats/covers.py`, `backend/tests/test_covers.py`.

- When Open Library yields no cover (miss or HTTP/parse error), query `https://www.googleapis.com/books/v1/volumes` with `q=intitle:<title>+inauthor:<author>` (omit `inauthor` when author is None), `maxResults=5`, `printType=books`, timeout 5 s, no API key.
- Match with the same `_norm` exact-then-prefix rule on `volumeInfo.title`; take `volumeInfo.imageLinks.thumbnail` (fallback `smallThumbnail`), force `https://`, strip `&edge=curl`.
- Errors from Google return None. Order of `find_cover` stays: Open Library first.
- Tests (MockTransport routing by host): OL hit never calls Google; OL miss + Google exact match returns the https thumbnail without `edge=curl`; OL miss + Google non-matching title → None; OL error + Google error → None; params check (`q` contains `intitle:` and `inauthor:`).
- Update `docs/STATUS.md`: remove the five resolved follow-up bullets (Tailwind trick, mobile catch, Gerenciar errors, palette labels, Google Books).
