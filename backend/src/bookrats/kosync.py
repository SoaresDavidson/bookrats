import logging
import sqlite3
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from bookrats import store
from bookrats.deps import get_conn, get_http

router = APIRouter()
log = logging.getLogger(__name__)

# The official server routes by API version through the Accept header (gin).
KOSYNC_ACCEPT = "application/vnd.koreader.v1+json"


class KosyncError(Exception):
    def __init__(self, status: int, code: int, message: str):
        self.status, self.code, self.message = status, code, message


def error_response(status: int, code: int, message: str) -> JSONResponse:
    return JSONResponse({"code": code, "message": message}, status_code=status)


def _text(v) -> str | None:
    if isinstance(v, str):
        return v
    if isinstance(v, list) and v and all(isinstance(x, str) for x in v):
        return ", ".join(v)
    return None


class Progress(BaseModel):
    model_config = ConfigDict(extra="ignore")
    document: str
    progress: str | int | float
    percentage: float = Field(ge=0, le=1, strict=True)
    device: str
    device_id: str
    metadata: Any = None

    def meta(self, key: str) -> str | None:
        return _text(self.metadata.get(key)) if isinstance(self.metadata, dict) else None


def auth_user(
    conn: sqlite3.Connection = Depends(get_conn),
    x_auth_user: str | None = Header(None),
    x_auth_key: str | None = Header(None),
):
    user = store.user_by_kosync(conn, x_auth_user, x_auth_key) if x_auth_user and x_auth_key else None
    if user is None:
        raise KosyncError(401, 2001, "Unauthorized")
    return user


def get_upstream(request: Request) -> str | None:
    return getattr(request.app.state, "kosync_upstream", None)


def _upstream_headers(user: store.User) -> dict[str, str]:
    return {"Accept": KOSYNC_ACCEPT, "x-auth-user": user.kosync_username, "x-auth-key": user.kosync_key}


async def forward_progress(http: httpx.AsyncClient, upstream: str, user: store.User, body: Any) -> httpx.Response | None:
    """Mirror a progress PUT to the upstream kosync server. None means it was unreachable."""
    try:
        return await http.put(f"{upstream}/syncs/progress", json=body, headers=_upstream_headers(user))
    except httpx.HTTPError as exc:
        log.warning("kosync upstream PUT failed for user %s: %s", user.id, exc)
        return None


async def fetch_progress(http: httpx.AsyncClient, upstream: str, user: store.User, document: str) -> dict | None:
    """Read progress from the upstream kosync server. None means fall back to the local copy."""
    try:
        resp = await http.get(f"{upstream}/syncs/progress/{document}", headers=_upstream_headers(user))
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("kosync upstream GET failed for user %s: %s", user.id, exc)
        return None
    return data if isinstance(data, dict) else None


@router.post("/users/create")
def create_user():
    return error_response(402, 2005, "User registration is disabled.")


@router.get("/users/auth")
def auth(user=Depends(auth_user)):
    return {"authorized": "OK"}


@router.put("/syncs/progress")
async def put_progress(
    request: Request,
    user=Depends(auth_user),
    conn: sqlite3.Connection = Depends(get_conn),
    http: httpx.AsyncClient = Depends(get_http),
    upstream: str | None = Depends(get_upstream),
):
    try:
        body = await request.json()
        p = Progress.model_validate(body)
    except (ValidationError, ValueError):
        return error_response(400, 2003, "Invalid request")
    ts = int(time.time())
    store.add_snapshot(
        conn,
        user.id,
        "kosync",
        p.percentage,
        ts,
        document=p.document,
        progress=str(p.progress),
        device=p.device,
        device_id=p.device_id,
        title=p.meta("title"),
        authors=p.meta("authors"),
    )
    if upstream:
        # Forward the raw body so fields Progress ignores (metadata, position...) reach upstream too.
        resp = await forward_progress(http, upstream, user, body)
        # Lenient: the snapshot is already stored locally, and upstream keeps only the latest
        # position, so the next PUT catches it up. A failing mirror must not break KOReader sync.
        if resp is not None and resp.status_code == 401:
            log.error("kosync upstream rejected user %s: account missing or key differs", user.kosync_username)
        elif resp is not None and not resp.is_success:
            log.warning("kosync upstream PUT for user %s returned %s", user.id, resp.status_code)
    return {"document": p.document, "timestamp": ts}


@router.get("/syncs/progress/{document}")
async def get_progress(
    document: str,
    user=Depends(auth_user),
    conn: sqlite3.Connection = Depends(get_conn),
    http: httpx.AsyncClient = Depends(get_http),
    upstream: str | None = Depends(get_upstream),
):
    if upstream:
        data = await fetch_progress(http, upstream, user, document)
        # Upstream answers {} for unknown documents: fall through so history recorded here still syncs.
        if data:
            return data
    r = store.latest_kosync(conn, user.id, document)
    if r is None:
        return {}
    return {
        "document": r["document"],
        "progress": r["progress"],
        "percentage": r["percentage"],
        "device": r["device"],
        "device_id": r["device_id"],
        "timestamp": r["ts"],
    }


@router.get("/healthcheck")
def healthcheck():
    return {"state": "OK"}
