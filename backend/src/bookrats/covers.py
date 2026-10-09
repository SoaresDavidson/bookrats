import httpx

OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json"


async def find_cover(client: httpx.AsyncClient, title: str, author: str | None) -> str | None:
    params = {"title": title, "limit": "5", "fields": "cover_i,title"}
    if author:
        params["author"] = author
    try:
        r = await client.get(OPENLIBRARY_SEARCH, params=params, timeout=5.0)
        r.raise_for_status()
        for doc in r.json().get("docs", []):
            if doc.get("cover_i"):
                return f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"
    except (httpx.HTTPError, ValueError, AttributeError):
        return None
    return None
