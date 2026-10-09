import sqlite3
import time
from datetime import UTC, datetime
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from bookrats import store
from bookrats.palette import PALETTE, effective_color
from bookrats.covers import find_cover
from bookrats.deps import get_conn, get_http
from bookrats.sessions import Session, group_sessions

router = APIRouter()


def _iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat().replace("+00:00", "Z")


def current_user(
    authorization: str | None = Header(default=None),
    conn: sqlite3.Connection = Depends(get_conn),
) -> store.User:
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(401, "unauthorized")
    user = store.user_by_token(conn, authorization[len("Bearer "):])
    if user is None:
        raise HTTPException(401, "unauthorized")
    return user


def _session(s: Session) -> dict:
    return {"from": s.start_pct, "to": s.end_pct,
            "started_at": _iso(s.started_at), "ended_at": _iso(s.ended_at)}


class ProgressIn(BaseModel):
    percentage: float = Field(ge=0, le=1, strict=True)


def _clean_cover_url(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if v == "":
        return None
    if len(v) > 2048:
        raise ValueError("cover_url too long")
    if urlsplit(v).scheme.lower() not in ("http", "https"):
        raise ValueError("cover_url must be http or https")
    return v


class ReadingIn(BaseModel):
    title: str
    author: str | None = None
    goodreads_book_id: str | None = None
    cover_url: str | None = None

    _v = field_validator("cover_url")(_clean_cover_url)


class CoverIn(BaseModel):
    cover_url: str | None

    _v = field_validator("cover_url")(_clean_cover_url)


class ColorIn(BaseModel):
    color: str


def _color(cid: str) -> dict:
    light, dark = PALETTE[cid]
    return {"id": cid, "light": light, "dark": dark}


class LinkIn(BaseModel):
    reading_id: int


@router.get("/summary")
def summary(user: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    reading = store.active_reading(conn)
    readers = []
    for i, u in enumerate(store.list_users(conn)):
        snaps = store.snapshots_for(conn, u.id, reading["id"]) if reading else []
        latest = snaps[-1] if snaps else None
        readers.append({
            "name": u.name,
            "color": _color(effective_color(u, i)),
            "percentage": latest.percentage if latest else None,
            "updated_at": _iso(latest.ts) if latest else None,
            "source": latest.source if latest else None,
            "last_session": _session(group_sessions(snaps)[-1]) if snaps else None,
        })
    return {
        "reading": {"id": reading["id"], "title": reading["title"], "author": reading["author"],
                    "cover_url": reading["cover_url"]} if reading else None,
        "me": user.name,
        "readers": readers,
    }


@router.get("/sessions")
def sessions(user: str, limit: int = 20, _: store.User = Depends(current_user),
             conn: sqlite3.Connection = Depends(get_conn)):
    target = next((u for u in store.list_users(conn) if u.name == user), None)
    if target is None:
        raise HTTPException(404, "unknown user")
    reading = store.active_reading(conn)
    if reading is None:
        return []
    snaps = store.snapshots_for(conn, target.id, reading["id"])
    return [_session(s) for s in reversed(group_sessions(snaps))][:max(limit, 0)]


@router.post("/progress", status_code=201)
def post_progress(body: ProgressIn, user: store.User = Depends(current_user),
                  conn: sqlite3.Connection = Depends(get_conn)):
    reading = store.active_reading(conn)
    if reading is None:
        raise HTTPException(409, "no active reading")
    store.add_snapshot(conn, user.id, "manual", body.percentage, int(time.time()), reading_id=reading["id"])
    return {}


@router.post("/readings", status_code=201)
async def post_reading(body: ReadingIn, _: store.User = Depends(current_user),
                       conn: sqlite3.Connection = Depends(get_conn),
                       http: httpx.AsyncClient = Depends(get_http)):
    cover = body.cover_url
    if cover is None:
        cover = await find_cover(http, body.title, body.author)
    return {"id": store.create_reading(conn, body.title, body.author, body.goodreads_book_id, cover)}


@router.patch("/readings/{reading_id}", status_code=204)
def patch_reading(reading_id: int, body: CoverIn, _: store.User = Depends(current_user),
                  conn: sqlite3.Connection = Depends(get_conn)):
    try:
        store.set_cover(conn, reading_id, body.cover_url)
    except KeyError:
        raise HTTPException(404, "unknown reading")
    return Response(status_code=204)


@router.get("/documents/unlinked")
def unlinked(_: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    return [{"hash": d["hash"], "title": d["title"], "authors": d["authors"],
             "last_device": d["last_device"], "first_seen": d["first_seen"]}
            for d in store.unlinked_documents(conn)]


@router.post("/documents/{hash}/link", status_code=204)
def link(hash: str, body: LinkIn, _: store.User = Depends(current_user),
         conn: sqlite3.Connection = Depends(get_conn)):
    if conn.execute("SELECT 1 FROM readings WHERE id=?", (body.reading_id,)).fetchone() is None:
        raise HTTPException(404, "unknown reading")
    try:
        store.link_document(conn, hash, body.reading_id)
    except KeyError:
        raise HTTPException(404, "unknown document")
    return Response(status_code=204)


@router.get("/palette")
def palette(_: store.User = Depends(current_user)):
    return [_color(cid) for cid in PALETTE]


@router.put("/me/color", status_code=204)
def put_color(body: ColorIn, user: store.User = Depends(current_user),
              conn: sqlite3.Connection = Depends(get_conn)):
    if body.color not in PALETTE:
        raise HTTPException(422, "unknown color")
    for i, u in enumerate(store.list_users(conn)):
        if u.id != user.id and effective_color(u, i) == body.color:
            raise HTTPException(409, "cor em uso")
    store.set_color(conn, user.id, body.color)
    return Response(status_code=204)
