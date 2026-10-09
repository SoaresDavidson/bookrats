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
    color: str | None = None


@dataclass
class Snapshot:
    user_id: int
    percentage: float
    ts: int
    source: str
    device: str | None
    document: str | None


_USER_COLS = "id, name, kosync_username, kosync_key, goodreads_user_id, api_token, color"


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


def create_reading(conn, title, author=None, goodreads_book_id=None, cover_url=None) -> int:
    try:
        conn.execute("UPDATE readings SET active=0")
        cur = conn.execute(
            "INSERT INTO readings (title, author, goodreads_book_id, active, created_at, cover_url) VALUES (?,?,?,1,?,?)",
            (title, author, goodreads_book_id, int(time.time()), cover_url),
        )
        if goodreads_book_id is not None:
            conn.execute("UPDATE documents SET reading_id=? WHERE hash=?",
                         (cur.lastrowid, "gr:" + str(goodreads_book_id)))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return cur.lastrowid


def set_cover(conn, reading_id, cover_url) -> None:
    cur = conn.execute("UPDATE readings SET cover_url=? WHERE id=?", (cover_url, reading_id))
    conn.commit()
    if cur.rowcount == 0:
        raise KeyError(reading_id)


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


def set_color(conn, user_id, color_id) -> None:
    conn.execute("UPDATE users SET color=? WHERE id=?", (color_id, user_id))
    conn.commit()


def claim_color(conn, user_id, color_id) -> bool:
    """Atomically set the user's color unless the other reader already has it."""
    from bookrats.palette import effective_color

    if conn.in_transaction:
        conn.commit()
    conn.execute("BEGIN IMMEDIATE")
    try:
        for i, u in enumerate(list_users(conn)):
            if u.id != user_id and effective_color(u, i) == color_id:
                conn.rollback()
                return False
        conn.execute("UPDATE users SET color=? WHERE id=?", (color_id, user_id))
        conn.commit()
        return True
    except BaseException:
        conn.rollback()
        raise


def activate_reading(conn, reading_id) -> None:
    if conn.execute("SELECT 1 FROM readings WHERE id=?", (reading_id,)).fetchone() is None:
        raise KeyError(reading_id)
    try:
        conn.execute("UPDATE readings SET active=0")
        conn.execute("UPDATE readings SET active=1 WHERE id=?", (reading_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def update_reading(conn, reading_id, **fields) -> None:
    allowed = {"title", "author", "goodreads_book_id", "cover_url"}
    fields = {k: v for k, v in fields.items() if k in allowed}
    if conn.execute("SELECT 1 FROM readings WHERE id=?", (reading_id,)).fetchone() is None:
        raise KeyError(reading_id)
    try:
        if fields:
            cols = ", ".join(f"{k}=?" for k in fields)
            conn.execute(f"UPDATE readings SET {cols} WHERE id=?", (*fields.values(), reading_id))
        gid = fields.get("goodreads_book_id")
        if gid:
            conn.execute("UPDATE documents SET reading_id=? WHERE hash=?", (reading_id, "gr:" + str(gid)))
        conn.commit()
    except Exception:
        conn.rollback()
        raise


FINISHED = 0.99


def list_readings(conn) -> list[dict]:
    users = list_users(conn)
    out = []
    for r in conn.execute("SELECT * FROM readings"):
        readers = []
        for u in users:
            snaps = snapshots_for(conn, u.id, r["id"])
            fin = next((s.ts for s in snaps if s.percentage >= FINISHED), None)
            readers.append({
                "name": u.name,
                "percentage": snaps[-1].percentage if snaps else None,
                "updated_at": snaps[-1].ts if snaps else None,
                "started_at": snaps[0].ts if snaps else None,
                "finished_at": fin,
            })
        with_data = [x for x in readers if x["started_at"] is not None]
        if r["active"]:
            status = "lendo"
        elif with_data and all(x["finished_at"] is not None for x in with_data):
            status = "lido"
        else:
            status = "pausado"
        latest = max((x["updated_at"] for x in readers if x["updated_at"] is not None), default=None)
        out.append({"row": r, "readers": readers, "status": status,
                    "sort": (bool(r["active"]), latest if latest is not None else r["created_at"], r["created_at"])})
    out.sort(key=lambda x: x["sort"], reverse=True)
    return out
