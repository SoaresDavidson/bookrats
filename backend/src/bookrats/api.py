import sqlite3
import time
from datetime import UTC, datetime
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from bookrats import store
from bookrats.covers import find_cover
from bookrats.deps import get_conn, get_http
from bookrats.palette import LABELS, PALETTE, effective_color, is_hex, resolve
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
    user = store.user_by_token(conn, authorization[len("Bearer ") :])
    if user is None:
        raise HTTPException(401, "unauthorized")
    return user


def _session(s: Session) -> dict:
    return {"from": s.start_pct, "to": s.end_pct, "started_at": _iso(s.started_at), "ended_at": _iso(s.ended_at)}


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

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        v = v.strip()
        if not v or len(v) > 200:
            raise ValueError("title must be 1-200 chars")
        return v

    @field_validator("author")
    @classmethod
    def _author(cls, v):
        return v.strip() or None if v is not None else None


class CoverIn(BaseModel):
    cover_url: str | None

    _v = field_validator("cover_url")(_clean_cover_url)


class ColorIn(BaseModel):
    color: str


def _color(value: str) -> dict:
    cid, light, dark = resolve(value)
    out = {"id": cid, "light": light, "dark": dark}
    if cid == "custom":
        out["hex"] = value.lower()
    return out


class LinkIn(BaseModel):
    reading_id: int


@router.get("/summary")
def summary(user: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    reading = store.active_reading(conn)
    readers = []
    for i, u in enumerate(store.list_users(conn)):
        snaps = store.snapshots_for(conn, u.id, reading["id"]) if reading else []
        latest = snaps[-1] if snaps else None
        readers.append(
            {
                "name": u.name,
                "color": _color(effective_color(u, i)),
                "percentage": latest.percentage if latest else None,
                "updated_at": _iso(latest.ts) if latest else None,
                "source": latest.source if latest else None,
                "last_session": _session(group_sessions(snaps)[-1]) if snaps else None,
            }
        )
    return {
        "reading": {
            "id": reading["id"],
            "title": reading["title"],
            "author": reading["author"],
            "cover_url": reading["cover_url"],
        }
        if reading
        else None,
        "me": user.name,
        "readers": readers,
    }


@router.get("/sessions")
def sessions(
    user: str, limit: int = 20, _: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)
):
    target = next((u for u in store.list_users(conn) if u.name == user), None)
    if target is None:
        raise HTTPException(404, "unknown user")
    reading = store.active_reading(conn)
    if reading is None:
        return []
    snaps = store.snapshots_for(conn, target.id, reading["id"])
    return [_session(s) for s in reversed(group_sessions(snaps))][: max(limit, 0)]


@router.post("/progress", status_code=201)
def post_progress(
    body: ProgressIn, user: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)
):
    reading = store.active_reading(conn)
    if reading is None:
        raise HTTPException(409, "no active reading")
    store.add_snapshot(conn, user.id, "manual", body.percentage, int(time.time()), reading_id=reading["id"])
    return {}


@router.post("/readings", status_code=201)
async def post_reading(
    body: ReadingIn,
    _: store.User = Depends(current_user),
    conn: sqlite3.Connection = Depends(get_conn),
    http: httpx.AsyncClient = Depends(get_http),
):
    cover = body.cover_url
    if cover is None:
        cover = await find_cover(http, body.title, body.author)
    return {"id": store.create_reading(conn, body.title, body.author, body.goodreads_book_id, cover)}


class ReadingPatch(BaseModel):
    title: str | None = None
    author: str | None = None
    goodreads_book_id: str | None = None
    cover_url: str | None = None

    _v = field_validator("cover_url")(_clean_cover_url)

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        if v is not None:
            v = v.strip()
            if not v or len(v) > 200:
                raise ValueError("title must be 1-200 chars")
        return v


@router.patch("/readings/{reading_id}", status_code=204)
def patch_reading(
    reading_id: int,
    body: ReadingPatch,
    _: store.User = Depends(current_user),
    conn: sqlite3.Connection = Depends(get_conn),
):
    fields = {k: getattr(body, k) for k in body.model_fields_set}
    if "title" in fields and fields["title"] is None:
        raise HTTPException(422, "title cannot be null")
    if isinstance(fields.get("author"), str):
        fields["author"] = fields["author"].strip() or None
    try:
        store.update_reading(conn, reading_id, **fields)
    except KeyError:
        raise HTTPException(404, "unknown reading") from None
    return Response(status_code=204)


@router.get("/readings")
def list_readings(_: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    def ts(v):
        return _iso(v) if v is not None else None

    return [
        {
            "id": x["row"]["id"],
            "title": x["row"]["title"],
            "author": x["row"]["author"],
            "cover_url": x["row"]["cover_url"],
            "goodreads_book_id": x["row"]["goodreads_book_id"],
            "active": bool(x["row"]["active"]),
            "created_at": _iso(x["row"]["created_at"]),
            "status": x["status"],
            "readers": [
                {
                    "name": r["name"],
                    "percentage": r["percentage"],
                    "updated_at": ts(r["updated_at"]),
                    "started_at": ts(r["started_at"]),
                    "finished_at": ts(r["finished_at"]),
                }
                for r in x["readers"]
            ],
        }
        for x in store.list_readings(conn)
    ]


@router.post("/readings/{reading_id}/activate", status_code=204)
def activate(reading_id: int, _: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    try:
        store.activate_reading(conn, reading_id)
    except KeyError:
        raise HTTPException(404, "unknown reading") from None
    return Response(status_code=204)


@router.post("/documents/{hash}/start", status_code=201)
async def start_document(
    hash: str,
    _: store.User = Depends(current_user),
    conn: sqlite3.Connection = Depends(get_conn),
    http: httpx.AsyncClient = Depends(get_http),
):
    doc = conn.execute("SELECT * FROM documents WHERE hash=?", (hash,)).fetchone()
    if doc is None:
        raise HTTPException(404, "unknown document")
    if doc["reading_id"] is not None:
        raise HTTPException(409, "documento já ligado a outra leitura")
    title = (doc["title"] or "").strip()
    if not title:
        raise HTTPException(422, "document has no title")
    cover = await find_cover(http, title, doc["authors"])
    gid = hash[3:] if hash.startswith("gr:") and len(hash) > 3 else None
    try:
        rid = store.start_from_document(conn, hash, title, doc["authors"], gid, cover)
    except store.DocumentAlreadyLinked:
        raise HTTPException(409, "documento já ligado a outra leitura") from None
    return {"id": rid}


@router.get("/documents/unlinked")
def unlinked(_: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    return [
        {
            "hash": d["hash"],
            "title": d["title"],
            "authors": d["authors"],
            "last_device": d["last_device"],
            "first_seen": d["first_seen"],
        }
        for d in store.unlinked_documents(conn)
    ]


@router.post("/documents/{hash}/link", status_code=204)
def link(hash: str, body: LinkIn, _: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    if conn.execute("SELECT 1 FROM readings WHERE id=?", (body.reading_id,)).fetchone() is None:
        raise HTTPException(404, "unknown reading")
    try:
        store.link_document(conn, hash, body.reading_id)
    except KeyError:
        raise HTTPException(404, "unknown document") from None
    return Response(status_code=204)


@router.get("/palette")
def palette(_: store.User = Depends(current_user)):
    return [{**_color(cid), "label": LABELS[cid]} for cid in PALETTE]


@router.put("/me/color", status_code=204)
def put_color(body: ColorIn, user: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    color = body.color.lower() if is_hex(body.color) else body.color
    if color not in PALETTE and not is_hex(color):
        raise HTTPException(422, "unknown color")
    if not store.claim_color(conn, user.id, color):
        raise HTTPException(409, "cor em uso")
    return Response(status_code=204)
