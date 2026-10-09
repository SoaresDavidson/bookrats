# Bookrats — Product Spec

## Vision

For two friends reading the same book on different devices who want to follow each other's pace without effort, Bookrats is a shared-reading dashboard that automatically gathers progress from KOReader and CrossPoint (via kosync) and from the Kindle app (via Goodreads), and shows — on a dual progress bar and on iPhone and Android home-screen widgets — where each one is and how far each advanced per session ("went from 34% to 41%"). Unlike Goodreads, which depends on manual updates and has no session history, Bookrats runs on the user's own homelab, captures every e-reader sync with no action, and treats the shared reading as the center of the product.

## Personas

**Davi — multi-device reader.** Reads on Kindle (KOReader) and Xteink (CrossPoint). Technical, owns a homelab. Wants to glance at a widget and know if he is ahead or behind. Pain: progress scattered across devices, no per-session history.

**Colleague — official-app reader.** Reads in the Kindle app, uses Goodreads. Will not configure anything technical; at most updates progress on Goodreads or taps once. Wants to see Davi's progress as easily, via widget. Pain: any extra step makes him stop logging.

## Decisions

- Exactly two users. No open sign-up.
- One active shared reading at a time.
- Comparison metric: book percentage only (0.0–1.0 internally, shown as integer %).
- Davi's source: Bookrats implements the kosync server API itself; KOReader and CrossPoint point to it. Every sync is stored as a snapshot (history, not just latest).
- Colleague's source: public Goodreads profile, progress updates read from his updates RSS feed, polled every 15 minutes. Fallback: manual % entry in the web app.
- Session: consecutive snapshots of one user with gaps ≤ 30 minutes. A session reports `from` = that user's last percentage before the session (or the session's first snapshot if none) and `to` = the session's last percentage.
- Hosting: homelab, Docker Compose, exposed via Cloudflare Tunnel (HTTPS, no open ports).
- Backend: Python 3.12 + FastAPI + SQLite.
- Web: React (Vite) PWA.
- iPhone widget: Scriptable (no Apple Developer account).
- Android widget: Expo app with `react-native-android-widget`, distributed as APK.
- Widgets and web read one JSON endpoint authenticated by per-user bearer token.

## MVP scope

In: kosync server API with snapshot history; Goodreads RSS polling; shared reading linking kosync document hashes and a Goodreads book id; session computation; web dashboard (dual bar, last session each, session history, manual entry, link unknown documents); `/api/summary`; Scriptable widget; Android widget; Docker + Cloudflare Tunnel deploy.

Out: WidgetKit native widget, multiple concurrent readings, more than two users, time/pages statistics, streaks, notifications, KOReader `statistics.sqlite3` import.

Success: for 2 weeks both can tell from the widget where the other is without opening an app or site, and Davi logs nothing manually.

## Known risks

- Colleague stops updating Goodreads → show "last update N days ago" on the widget.
- Goodreads updates may be in pages, not % → parser converts "page X of Y" to X/Y.
- CrossPoint accepts a custom kosync server (Settings → System → KOReader Sync → Sync Server URL, HTTP or HTTPS). No automatic sync option was found in its source; sync appears to be manual ("Sync Progress" in the reader menu, or the long-press shortcut set to KOSync) — confirm on the device.
- KOReader and CrossPoint both support binary (partial MD5 of file content) or filename matching; use binary on both and the same file so the hashes match. Linking still supports several hashes per reading.
