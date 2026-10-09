import sqlite3
import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field

from bookrats import store
from bookrats.deps import get_conn
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


class ReadingIn(BaseModel):
    title: str
    author: str | None = None
    goodreads_book_id: str | None = None


class LinkIn(BaseModel):
    reading_id: int


@router.get("/summary")
def summary(user: store.User = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)):
    reading = store.active_reading(conn)
    readers = []
    for u in store.list_users(conn):
        snaps = store.snapshots_for(conn, u.id, reading["id"]) if reading else []
        latest = snaps[-1] if snaps else None
        readers.append({
            "name": u.name,
            "percentage": latest.percentage if latest else None,
            "updated_at": _iso(latest.ts) if latest else None,
            "source": latest.source if latest else None,
            "last_session": _session(group_sessions(snaps)[-1]) if snaps else None,
        })
    return {
        "reading": {"id": reading["id"], "title": reading["title"], "author": reading["author"]} if reading else None,
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
def post_reading(body: ReadingIn, _: store.User = Depends(current_user),
                 conn: sqlite3.Connection = Depends(get_conn)):
    return {"id": store.create_reading(conn, body.title, body.author, body.goodreads_book_id)}


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
