import asyncio
import re
import unicodedata

import httpx

OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json"
GOOGLE_VOLUMES = "https://www.googleapis.com/books/v1/volumes"


def _norm(text: str) -> str:
    s = unicodedata.normalize("NFKD", text.casefold())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^\w\s]", " ", s).split())


def _url(doc: dict) -> str:
    return f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"


def _pick(items: list, title: str):
    want = _norm(title)
    for match in (lambda t: t == want, lambda t: t.startswith(want)):
        for it in items:
            if match(_norm(str(it.get("title", "")))):
                return it
    return None


async def _ol_docs(
    client: httpx.AsyncClient, title: str, author: str | None, limit: int, free_text: bool = False
) -> list[dict]:
    fields = "cover_i,title,author_name,edition_count"
    if free_text:
        params = {"q": " ".join(x for x in (title, author) if x), "limit": str(limit), "fields": fields}
    else:
        params = {"title": title, "limit": str(limit), "fields": fields}
        if author:
            params["author"] = author
    r = await client.get(OPENLIBRARY_SEARCH, params=params, timeout=5.0)
    r.raise_for_status()
    return [d for d in r.json().get("docs", []) if d.get("cover_i")]


def _google_url(volume: dict) -> str | None:
    links = volume.get("imageLinks") or {}
    url = links.get("thumbnail") or links.get("smallThumbnail")
    return url.replace("http://", "https://", 1).replace("&edge=curl", "") if url else None


async def _google_volumes(
    client: httpx.AsyncClient, title: str, author: str | None, key: str | None, limit: int
) -> list[dict]:
    # Free text: intitle:/inauthor: with quotes misses translated editions (e.g. "Orgulho e Preconceito").
    q = " ".join(x for x in (title, author) if x)
    params = {"q": q, "maxResults": str(limit), "printType": "books"}
    if key:
        params["key"] = key
    r = await client.get(GOOGLE_VOLUMES, params=params, timeout=5.0)
    r.raise_for_status()
    return [v for v in (item["volumeInfo"] for item in r.json().get("items", [])) if _google_url(v)]


_ERRORS = (httpx.HTTPError, ValueError, AttributeError, KeyError, TypeError)


async def _openlibrary(client: httpx.AsyncClient, title: str, author: str | None) -> str | None:
    try:
        d = _pick(await _ol_docs(client, title, author, 5), title)
        return _url(d) if d else None
    except _ERRORS:
        return None


async def _google(client: httpx.AsyncClient, title: str, author: str | None, key: str | None) -> str | None:
    try:
        v = _pick(await _google_volumes(client, title, author, key, 5), title)
        return _google_url(v) if v else None
    except _ERRORS:
        return None


async def find_cover(
    client: httpx.AsyncClient, title: str, author: str | None, google_key: str | None = None
) -> str | None:
    """Best automatic match; never guesses (exact or prefix title only)."""
    return await _openlibrary(client, title, author) or await _google(client, title, author, google_key)


def _first(names) -> str | None:
    return names[0] if isinstance(names, list) and names else None


async def search_covers(
    client: httpx.AsyncClient, title: str, author: str | None, google_key: str | None = None
) -> dict:
    """Every cover both sources return for the query, for a person to choose from.

    Returns {"results": [...], "unavailable": [source, ...]} so the UI can say which source failed.
    """
    unavailable: list[str] = []

    async def ol():
        try:
            docs = await _ol_docs(client, title, author, 12, free_text=True)
        except _ERRORS:
            unavailable.append("openlibrary")
            return []
        return [
            {"url": _url(d), "title": d.get("title"), "author": _first(d.get("author_name")), "source": "openlibrary"}
            for d in docs
        ]

    async def google():
        try:
            vols = await _google_volumes(client, title, author, google_key, 12)
        except _ERRORS:
            unavailable.append("google")
            return []
        return [
            {"url": _google_url(v), "title": v.get("title"), "author": _first(v.get("authors")), "source": "google"}
            for v in vols
        ]

    seen: set[str] = set()
    out = []
    for c in [x for group in await asyncio.gather(ol(), google()) for x in group]:
        if c["url"] not in seen:
            seen.add(c["url"])
            out.append(c)
    return {"results": out, "unavailable": sorted(unavailable)}
