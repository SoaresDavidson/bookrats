import asyncio
import calendar
from pathlib import Path

import httpx
import pytest

from bookrats import store
from bookrats.goodreads import FEED_URL, parse_updates, poll_once

FIX = (Path(__file__).parent / "fixtures" / "goodreads_updates.xml").read_text(encoding="utf-8")
PCT_GUID = "UserStatus1346999999"
PAGE_GUID = "UserStatus1346548617"


def by_guid(updates, guid):
    return next(u for u in updates if u.guid == guid)


def mock_client(requests=None):
    def handler(req):
        if requests is not None:
            requests.append(str(req.url))
        return httpx.Response(200, text=FIX)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def run_poll(conn, client):
    async def go():
        async with client:
            return await poll_once(conn, client)

    return asyncio.run(go())


def test_parses_percent_update():
    u = by_guid(parse_updates(FIX), PCT_GUID)
    assert u.percentage == 0.34
    assert u.book_id == "31243809"
    assert u.ts == calendar.timegm((2026, 10, 9, 4, 0, 0))


def test_parses_page_update_as_ratio():
    u = by_guid(parse_updates(FIX), PAGE_GUID)
    assert u.percentage == pytest.approx(120 / 500)
    assert u.book_id == "31243809"


def test_ignores_non_progress_items():
    ups = parse_updates(FIX)
    assert len(ups) == 2
    assert all(0 <= u.percentage <= 1 for u in ups)


def test_feed_url():
    assert FEED_URL.format(user_id="123") == "https://www.goodreads.com/user/updates_rss/123"


def test_poll_once_dedupes(conn, davi, colega):
    urls = []
    c = mock_client(urls)

    async def go():
        async with c:
            return await poll_once(conn, c), await poll_once(conn, c)

    assert asyncio.run(go()) == (2, 0)
    assert set(urls) == {"https://www.goodreads.com/user/updates_rss/123"}


def test_poll_once_attaches_active_reading_by_book_id(conn, colega):
    r = store.create_reading(conn, "Letters from Paris", goodreads_book_id="31243809")
    run_poll(conn, mock_client())
    assert [s.percentage for s in store.snapshots_for(conn, colega.id, r)] == pytest.approx([0.24, 0.34])


def test_poll_once_other_book_has_no_reading(conn, colega):
    r = store.create_reading(conn, "Other", goodreads_book_id="999")
    assert run_poll(conn, mock_client()) == 2
    n = conn.execute("SELECT COUNT(*) FROM snapshots WHERE user_id=?", (colega.id,)).fetchone()[0]
    assert n == 2
    assert store.snapshots_for(conn, colega.id, r) == []
