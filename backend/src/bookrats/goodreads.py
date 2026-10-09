import asyncio
import calendar
import logging
import re
from dataclasses import dataclass

import feedparser
import httpx

from bookrats import db, store

FEED_URL = "https://www.goodreads.com/user/updates_rss/{user_id}"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)

_PCT_RE = re.compile(r"is (\d+)% done with")
_PAGE_RE = re.compile(r"is on page (\d+) of (\d+) of")
_TITLE_RE = re.compile(r"(?:is \d+% done with|is on page \d+ of \d+ of) (.+?)\.?$")
_BOOK_RE = re.compile(r"/book/show/(\d+)")

log = logging.getLogger(__name__)


@dataclass
class Update:
    guid: str
    book_id: str | None
    percentage: float
    ts: int
    title: str | None = None


def _percentage(title: str) -> float | None:
    m = _PCT_RE.search(title)
    if m:
        p = int(m.group(1)) / 100
        return p if p <= 1 else None
    m = _PAGE_RE.search(title)
    if m:
        x, y = int(m.group(1)), int(m.group(2))
        if y == 0 or x / y > 1:
            return None
        return x / y
    return None


def parse_updates(xml: str) -> list[Update]:
    out = []
    for e in feedparser.parse(xml).entries:
        guid = e.get("id") or e.get("guid") or ""
        if not guid.startswith("UserStatus"):
            continue
        text = " ".join(e.get("title", "").split())
        pct = _percentage(text)
        tm = _TITLE_RE.search(text)
        if pct is None or not e.get("published_parsed"):
            continue
        m = _BOOK_RE.search(e.get("summary", "") or e.get("description", "") or "")
        out.append(Update(guid, m.group(1) if m else None, pct, calendar.timegm(e.published_parsed),
                          tm.group(1) if tm else None))
    return out


async def poll_once(conn, client: httpx.AsyncClient) -> int:
    stored = 0
    for user in store.list_users(conn):
        if not user.goodreads_user_id:
            continue
        try:
            resp = await client.get(
                FEED_URL.format(user_id=user.goodreads_user_id), headers={"User-Agent": USER_AGENT}
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("goodreads fetch failed for user %s: %s", user.id, exc)
            continue
        for u in sorted(parse_updates(resp.text), key=lambda u: u.ts):
            active = store.active_reading(conn)
            if u.book_id is None:
                continue
            doc = "gr:" + u.book_id
            if store.add_snapshot(conn, user.id, "goodreads", u.percentage, u.ts, document=doc,
                                  device="goodreads", title=u.title, external_id="gr:" + u.guid):
                stored += 1
            if active and active["goodreads_book_id"] == u.book_id:
                store.link_document(conn, doc, active["id"])
    return stored


async def poll_forever(db_path: str, interval: int) -> None:
    conn = db.connect(db_path)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            while True:
                try:
                    await poll_once(conn, client)
                except Exception:
                    log.exception("goodreads poll failed")
                await asyncio.sleep(interval)
    finally:
        conn.close()
