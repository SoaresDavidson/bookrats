import asyncio

import httpx

from bookrats.covers import search_covers

OL = {
    "docs": [
        {"title": "Duna", "author_name": ["Frank Herbert"], "cover_i": 1},
        {"title": "Duna sem capa"},
        {"title": "O Messias de Duna", "author_name": ["Frank Herbert"], "cover_i": 2},
    ]
}
G_THUMB = "http://books.google.com/books/content?id=A&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api"
GB = {
    "items": [
        {"volumeInfo": {"title": "Duna", "authors": ["Frank Herbert"], "imageLinks": {"thumbnail": G_THUMB}}},
        {"volumeInfo": {"title": "Sem imagem"}},
    ]
}


def _run(ol=None, google=None, key=None, author="Frank Herbert"):
    seen = []

    def routed(req):
        seen.append(req)
        if req.url.host == "www.googleapis.com":
            return google(req) if google else httpx.Response(200, json=GB)
        return ol(req) if ol else httpx.Response(200, json=OL)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(routed)) as c:
            return await search_covers(c, "Duna", author, key)

    return asyncio.run(go()), seen


def test_returns_candidates_from_both_sources_without_title_filter():
    out, _ = _run()
    assert out["unavailable"] == []
    assert out["results"] == [
        {
            "url": "https://covers.openlibrary.org/b/id/1-L.jpg",
            "title": "Duna",
            "author": "Frank Herbert",
            "source": "openlibrary",
        },
        {
            "url": "https://covers.openlibrary.org/b/id/2-L.jpg",
            "title": "O Messias de Duna",
            "author": "Frank Herbert",
            "source": "openlibrary",
        },
        {
            "url": "https://books.google.com/books/content?id=A&printsec=frontcover&img=1&zoom=1&source=gbs_api",
            "title": "Duna",
            "author": "Frank Herbert",
            "source": "google",
        },
    ]


def test_one_source_failing_still_returns_the_other():
    out, _ = _run(ol=lambda r: httpx.Response(500))
    assert [c["source"] for c in out["results"]] == ["google"]
    assert out["unavailable"] == ["openlibrary"]
    out, _ = _run(google=lambda r: httpx.Response(429))
    assert [c["source"] for c in out["results"]] == ["openlibrary", "openlibrary"]
    assert out["unavailable"] == ["google"]


def test_duplicate_urls_are_dropped():
    dup = {"docs": [{"title": "Duna", "cover_i": 1}, {"title": "Duna", "cover_i": 1}]}
    out, _ = _run(ol=lambda r: httpx.Response(200, json=dup), google=lambda r: httpx.Response(200, json={}))
    assert len(out["results"]) == 1


def test_google_key_sent_only_when_configured():
    _, seen = _run(key="k123")
    g = [r for r in seen if r.url.host == "www.googleapis.com"][0]
    assert g.url.params["key"] == "k123"
    _, seen = _run()
    g = [r for r in seen if r.url.host == "www.googleapis.com"][0]
    assert "key" not in g.url.params


def test_no_author_means_no_author_filters():
    _, seen = _run(author=None)
    ol = [r for r in seen if r.url.host == "openlibrary.org"][0]
    g = [r for r in seen if r.url.host == "www.googleapis.com"][0]
    assert ol.url.params["q"] == "Duna"
    assert "inauthor" not in g.url.params["q"]


def test_openlibrary_uses_free_text_query_with_author():
    _, seen = _run()
    ol = [r for r in seen if r.url.host == "openlibrary.org"][0]
    assert ol.url.params["q"] == "Duna Frank Herbert"
    assert "title" not in ol.url.params
