import asyncio

import httpx

from bookrats.covers import find_cover

URL = "https://covers.openlibrary.org/b/id/12345-L.jpg"


def _run(handler, title="Duna", author="Frank Herbert", google=None):
    def routed(req):
        if req.url.host == "www.googleapis.com":
            return google(req) if google else httpx.Response(200, json={})
        return handler(req)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(routed)) as c:
            return await find_cover(c, title, author)
    return asyncio.run(go())


def test_hit_uses_first_doc_with_cover_and_params():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json={"docs": [{"title": "Duna"}, {"title": "Duna", "cover_i": 12345}]})

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


def test_prefers_exact_title_over_earlier_prefix_match():
    docs = [{"title": "Imperador-Deus de Duna", "cover_i": 1},
            {"title": "Duna", "cover_i": 12345}]
    assert _run(lambda r: httpx.Response(200, json={"docs": docs})) == URL


def test_exact_match_ignores_accents_case_punctuation():
    docs = [{"title": "Outro livro", "cover_i": 1}, {"title": "DÚNA!", "cover_i": 12345}]
    assert _run(lambda r: httpx.Response(200, json={"docs": docs})) == URL


def test_prefix_match_when_no_exact():
    docs = [{"title": "Imperador-Deus de Duna", "cover_i": 1},
            {"title": "Duna: edicao nova", "cover_i": 12345}]
    assert _run(lambda r: httpx.Response(200, json={"docs": docs})) == URL


def test_no_exact_or_prefix_match_returns_none():
    docs = [{"title": "Imperador-Deus de Duna", "cover_i": 1}, {"title": "Dune", "cover_i": 2}]
    assert _run(lambda r: httpx.Response(200, json={"docs": docs})) is None


GTHUMB = "http://books.google.com/books/content?id=X&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api"
GURL = "https://books.google.com/books/content?id=X&printsec=frontcover&img=1&zoom=1&source=gbs_api"
OL_MISS = lambda r: httpx.Response(200, json={"docs": []})  # noqa: E731


def _gitems(*titles, key="thumbnail"):
    return httpx.Response(200, json={"items": [
        {"volumeInfo": {"title": t, "imageLinks": {key: GTHUMB}}} for t in titles]})


def test_ol_hit_never_calls_google():
    def google(req):
        raise AssertionError("google called")
    ol = lambda r: httpx.Response(200, json={"docs": [{"title": "Duna", "cover_i": 12345}]})  # noqa: E731
    assert _run(ol, google=google) == URL


def test_google_fallback_exact_match_https_no_curl_and_params():
    seen = []

    def google(req):
        seen.append(req)
        return _gitems("Duna")

    assert _run(OL_MISS, google=google) == GURL
    p = seen[0].url.params
    assert 'intitle:"Duna"' in p["q"] and 'inauthor:"Frank Herbert"' in p["q"]
    assert p["maxResults"] == "5" and p["printType"] == "books"


def test_google_no_inauthor_when_no_author():
    seen = []

    def google(req):
        seen.append(req)
        return _gitems("Duna")

    _run(OL_MISS, author=None, google=google)
    assert "inauthor" not in seen[0].url.params["q"]


def test_google_small_thumbnail_fallback():
    assert _run(OL_MISS, google=lambda r: _gitems("Duna", key="smallThumbnail")) == GURL


def test_google_prefix_match():
    assert _run(OL_MISS, google=lambda r: _gitems("Outro", "Duna: edicao nova")) == GURL


def test_google_non_matching_title_none():
    assert _run(OL_MISS, google=lambda r: _gitems("Dune", "Imperador-Deus de Duna")) is None


def test_google_no_items_none():
    assert _run(OL_MISS, google=lambda r: httpx.Response(200, json={"totalItems": 0})) is None


def test_ol_error_and_google_error_none():
    def boom(req):
        raise httpx.ConnectError("down")
    assert _run(boom, google=boom) is None
    assert _run(lambda r: httpx.Response(500), google=lambda r: httpx.Response(503)) is None


def test_ol_error_falls_back_to_google():
    assert _run(lambda r: httpx.Response(500), google=lambda r: _gitems("Duna")) == GURL
