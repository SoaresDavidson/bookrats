import sqlite3
from collections.abc import Iterator

from fastapi import Request

from bookrats import db


def get_conn(request: Request) -> Iterator[sqlite3.Connection]:
    conn = db.connect(request.app.state.db_path)
    try:
        yield conn
    finally:
        conn.close()
