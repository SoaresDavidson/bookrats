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


async def _openlibrary(client: httpx.AsyncClient, title: str, author: str | None) -> str | None:
    params = {"title": title, "limit": "5", "fields": "cover_i,title,edition_count"}
    if author:
        params["author"] = author
    try:
        r = await client.get(OPENLIBRARY_SEARCH, params=params, timeout=5.0)
        r.raise_for_status()
        d = _pick([d for d in r.json().get("docs", []) if d.get("cover_i")], title)
        return _url(d) if d else None
    except (httpx.HTTPError, ValueError, AttributeError, KeyError, TypeError):
        return None


async def _google(client: httpx.AsyncClient, title: str, author: str | None) -> str | None:
    q = f"intitle:{title}" + (f" inauthor:{author}" if author else "")
    params = {"q": q, "maxResults": "5", "printType": "books"}
    try:
        r = await client.get(GOOGLE_VOLUMES, params=params, timeout=5.0)
        r.raise_for_status()
        vols = [v["volumeInfo"] for v in r.json().get("items", [])]
        v = _pick([v for v in vols if (v.get("imageLinks") or {}).get("thumbnail")
                   or (v.get("imageLinks") or {}).get("smallThumbnail")], title)
        if not v:
            return None
        links = v["imageLinks"]
        url = links.get("thumbnail") or links["smallThumbnail"]
        return url.replace("http://", "https://", 1).replace("&edge=curl", "")
    except (httpx.HTTPError, ValueError, AttributeError, KeyError, TypeError):
        return None


async def find_cover(client: httpx.AsyncClient, title: str, author: str | None) -> str | None:
    return await _openlibrary(client, title, author) or await _google(client, title, author)
