import sqlite3
from collections.abc import Iterator

import httpx
from fastapi import Request

from bookrats import db


def get_conn(request: Request) -> Iterator[sqlite3.Connection]:
    conn = db.connect(request.app.state.db_path)
    try:
        yield conn
    finally:
        conn.close()


def new_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=5.0, headers={"User-Agent": "Bookrats/0.1 (personal reading tracker)"})


def get_http(request: Request) -> httpx.AsyncClient:
    state = request.app.state
    if getattr(state, "http", None) is None:
        state.http = new_http_client()
    return state.http


def get_google_key(request: Request) -> str | None:
    return getattr(request.app.state, "google_books_key", None)
