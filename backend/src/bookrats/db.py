import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  kosync_username TEXT UNIQUE, kosync_key TEXT,
  goodreads_user_id TEXT, api_token TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT,
  goodreads_book_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS documents (
  hash TEXT PRIMARY KEY, reading_id INTEGER REFERENCES readings(id),
  first_seen INTEGER NOT NULL, last_device TEXT, title TEXT, authors TEXT);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  source TEXT NOT NULL CHECK (source IN ('kosync','goodreads','manual')),
  document TEXT, reading_id INTEGER REFERENCES readings(id),
  percentage REAL NOT NULL CHECK (percentage BETWEEN 0 AND 1),
  progress TEXT, device TEXT, device_id TEXT, ts INTEGER NOT NULL, external_id TEXT UNIQUE);
"""


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    cols = [r[1] for r in conn.execute("pragma table_info(readings)")]
    if "cover_url" not in cols:
        conn.execute("ALTER TABLE readings ADD COLUMN cover_url TEXT")
    conn.commit()


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys = ON")
    init_schema(conn)
    return conn
