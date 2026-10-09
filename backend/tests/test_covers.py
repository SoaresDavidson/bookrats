import asyncio

import httpx

from bookrats.covers import find_cover

URL = "https://covers.openlibrary.org/b/id/12345-L.jpg"


def _run(handler, title="Duna", author="Frank Herbert"):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await find_cover(c, title, author)
    return asyncio.run(go())


def test_hit_uses_first_doc_with_cover_and_params():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json={"docs": [{"title": "Dune"}, {"title": "Dune", "cover_i": 12345}]})

    assert _run(handler) == URL
    p = seen[0].url.params
    assert p["title"] == "Duna" and p["author"] == "Frank Herbert" and p["limit"] == "5"


def test_no_author_param_when_none():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json={"docs": [{"cover_i": 1}]})

    _run(handler, author=None)
    assert "author" not in seen[0].url.params


def test_miss():
    assert _run(lambda r: httpx.Response(200, json={"docs": []})) is None


def test_http_500():
    assert _run(lambda r: httpx.Response(500)) is None


def test_connect_error():
    def handler(req):
        raise httpx.ConnectError("down")
    assert _run(handler) is None
