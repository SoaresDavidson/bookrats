import sqlite3
import time
from typing import Any

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from bookrats import store
from bookrats.deps import get_conn

router = APIRouter()


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


@router.post("/users/create")
def create_user():
    return error_response(402, 2005, "User registration is disabled.")


@router.get("/users/auth")
def auth(user=Depends(auth_user)):
    return {"authorized": "OK"}


@router.put("/syncs/progress")
async def put_progress(request: Request, user=Depends(auth_user),
                       conn: sqlite3.Connection = Depends(get_conn)):
    try:
        p = Progress.model_validate(await request.json())
    except (ValidationError, ValueError):
        return error_response(400, 2003, "Invalid request")
    ts = int(time.time())
    store.add_snapshot(conn, user.id, "kosync", p.percentage, ts, document=p.document,
                       progress=str(p.progress), device=p.device, device_id=p.device_id,
                       title=p.meta("title"), authors=p.meta("authors"))
    return {"document": p.document, "timestamp": ts}


@router.get("/syncs/progress/{document}")
def get_progress(document: str, user=Depends(auth_user),
                 conn: sqlite3.Connection = Depends(get_conn)):
    r = store.latest_kosync(conn, user.id, document)
    if r is None:
        return {}
    return {"document": r["document"], "progress": r["progress"], "percentage": r["percentage"],
            "device": r["device"], "device_id": r["device_id"], "timestamp": r["ts"]}


@router.get("/healthcheck")
def healthcheck():
    return {"state": "OK"}
