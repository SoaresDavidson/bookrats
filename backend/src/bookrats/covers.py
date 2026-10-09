import re
import unicodedata

import httpx

OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json"


def _norm(text: str) -> str:
    s = unicodedata.normalize("NFKD", text.casefold())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^\w\s]", " ", s).split())


def _url(doc: dict) -> str:
    return f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"


async def find_cover(client: httpx.AsyncClient, title: str, author: str | None) -> str | None:
    params = {"title": title, "limit": "5", "fields": "cover_i,title,edition_count"}
    if author:
        params["author"] = author
    try:
        r = await client.get(OPENLIBRARY_SEARCH, params=params, timeout=5.0)
        r.raise_for_status()
        docs = [d for d in r.json().get("docs", []) if d.get("cover_i")]
        want = _norm(title)
        for d in docs:
            if _norm(str(d.get("title", ""))) == want:
                return _url(d)
        for d in docs:
            if _norm(str(d.get("title", ""))).startswith(want):
                return _url(d)
    except (httpx.HTTPError, ValueError, AttributeError):
        return None
    return None
