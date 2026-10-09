import sqlite3
import time
from dataclasses import dataclass


@dataclass
class User:
    id: int
    name: str
    kosync_username: str | None
    kosync_key: str | None
    goodreads_user_id: str | None
    api_token: str


@dataclass
class Snapshot:
    user_id: int
    percentage: float
    ts: int
    source: str
    device: str | None
    document: str | None


_USER_COLS = "id, name, kosync_username, kosync_key, goodreads_user_id, api_token"


def _user(row: sqlite3.Row | None) -> User | None:
    return User(**dict(row)) if row else None


def add_user(conn, name, api_token, kosync_username=None, kosync_key=None, goodreads_user_id=None) -> User:
    cur = conn.execute(
        "INSERT INTO users (name, api_token, kosync_username, kosync_key, goodreads_user_id) VALUES (?,?,?,?,?)",
        (name, api_token, kosync_username, kosync_key, goodreads_user_id),
    )
    conn.commit()
    return User(cur.lastrowid, name, kosync_username, kosync_key, goodreads_user_id, api_token)


def user_by_kosync(conn, username, key) -> User | None:
    return _user(conn.execute(
        f"SELECT {_USER_COLS} FROM users WHERE kosync_username=? AND kosync_key=?", (username, key)).fetchone())


def user_by_token(conn, token) -> User | None:
    return _user(conn.execute(f"SELECT {_USER_COLS} FROM users WHERE api_token=?", (token,)).fetchone())


def list_users(conn) -> list[User]:
    return [_user(r) for r in conn.execute(f"SELECT {_USER_COLS} FROM users ORDER BY id")]


def create_reading(conn, title, author=None, goodreads_book_id=None) -> int:
    try:
        conn.execute("UPDATE readings SET active=0")
        cur = conn.execute(
            "INSERT INTO readings (title, author, goodreads_book_id, active, created_at) VALUES (?,?,?,1,?)",
            (title, author, goodreads_book_id, int(time.time())),
        )
        if goodreads_book_id is not None:
            conn.execute("UPDATE documents SET reading_id=? WHERE hash=?",
                         (cur.lastrowid, "gr:" + str(goodreads_book_id)))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return cur.lastrowid


def active_reading(conn) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM readings WHERE active=1 ORDER BY id DESC LIMIT 1").fetchone()


def add_snapshot(conn, user_id, source, percentage, ts, *, document=None, reading_id=None,
                 progress=None, device=None, device_id=None, external_id=None,
                 title=None, authors=None) -> bool:
    if not 0 <= percentage <= 1:
        raise ValueError(f"percentage out of range: {percentage}")
    if external_id is not None and conn.execute(
            "SELECT 1 FROM snapshots WHERE external_id=?", (external_id,)).fetchone():
        return False
    try:
        if document is not None:
            conn.execute(
                "INSERT INTO documents (hash, first_seen, last_device, title, authors) VALUES (?,?,?,?,?) "
                "ON CONFLICT(hash) DO UPDATE SET last_device=COALESCE(excluded.last_device, last_device), "
                "title=COALESCE(excluded.title, title), authors=COALESCE(excluded.authors, authors)",
                (document, ts, device, title, authors),
            )
        conn.execute(
            "INSERT INTO snapshots (user_id, source, document, reading_id, percentage, progress, device, device_id, ts, external_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (user_id, source, document, reading_id, percentage, progress, device, device_id, ts, external_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return True


def link_document(conn, hash, reading_id) -> None:
    cur = conn.execute("UPDATE documents SET reading_id=? WHERE hash=?", (reading_id, hash))
    conn.commit()
    if cur.rowcount == 0:
        raise KeyError(hash)


def unlinked_documents(conn) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM documents WHERE reading_id IS NULL ORDER BY first_seen, hash").fetchall()


def snapshots_for(conn, user_id, reading_id) -> list[Snapshot]:
    rows = conn.execute(
        "SELECT s.user_id, s.percentage, s.ts, s.source, s.device, s.document FROM snapshots s "
        "WHERE s.user_id=? AND (s.reading_id=? OR s.document IN "
        "(SELECT hash FROM documents WHERE reading_id=?)) ORDER BY s.ts, s.id",
        (user_id, reading_id, reading_id),
    )
    return [Snapshot(**dict(r)) for r in rows]


def latest_kosync(conn, user_id, document) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM snapshots WHERE user_id=? AND source='kosync' AND document=? "
        "ORDER BY ts DESC, id DESC LIMIT 1", (user_id, document)).fetchone()
