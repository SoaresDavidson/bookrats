import pytest

from bookrats import store


def test_add_snapshot_rejects_out_of_range(conn, davi):
    with pytest.raises(ValueError):
        store.add_snapshot(conn, davi.id, "manual", 1.2, 100)


def test_external_id_dedupes(conn, colega):
    assert store.add_snapshot(conn, colega.id, "goodreads", 0.3, 100, external_id="g1") is True
    assert store.add_snapshot(conn, colega.id, "goodreads", 0.3, 100, external_id="g1") is False


def test_linking_is_retroactive(conn, davi):
    r = store.create_reading(conn, "Duna")
    store.add_snapshot(conn, davi.id, "kosync", 0.1, 100, document="h1")
    assert store.snapshots_for(conn, davi.id, r) == []
    with pytest.raises(KeyError):
        store.link_document(conn, "unknown", r)
    store.link_document(conn, "h1", r)
    assert [s.percentage for s in store.snapshots_for(conn, davi.id, r)] == [0.1]


def test_create_reading_deactivates_previous(conn):
    store.create_reading(conn, "A")
    b = store.create_reading(conn, "B")
    assert store.active_reading(conn)["id"] == b


def test_user_by_kosync(conn, davi):
    assert store.user_by_kosync(conn, "davi", "md5x").id == davi.id
    assert store.user_by_kosync(conn, "davi", "wrong") is None


def test_user_by_token(conn, davi):
    assert store.user_by_token(conn, "t-davi").name == "Davi"
    assert store.user_by_token(conn, "nope") is None


def test_list_users_ordered_by_id(conn, davi, colega):
    assert [u.name for u in store.list_users(conn)] == ["Davi", "Colega"]


def test_unlinked_documents(conn, davi):
    r = store.create_reading(conn, "Duna")
    store.add_snapshot(conn, davi.id, "kosync", 0.1, 100, document="h1")
    assert [d["hash"] for d in store.unlinked_documents(conn)] == ["h1"]
    store.link_document(conn, "h1", r)
    assert store.unlinked_documents(conn) == []


def test_latest_kosync_returns_newest(conn, davi):
    store.add_snapshot(conn, davi.id, "kosync", 0.5, 200, document="h1")
    store.add_snapshot(conn, davi.id, "kosync", 0.2, 100, document="h1")
    assert store.latest_kosync(conn, davi.id, "h1")["percentage"] == 0.5
    assert store.latest_kosync(conn, davi.id, "other") is None


def test_add_snapshot_stores_title_and_authors(conn, davi):
    store.add_snapshot(conn, davi.id, "kosync", 0.1, 100, document="h1", title="Duna", authors="Herbert")
    row = conn.execute("SELECT title, authors FROM documents WHERE hash='h1'").fetchone()
    assert (row["title"], row["authors"]) == ("Duna", "Herbert")


def test_connect_uses_wal_and_busy_timeout(conn):
    assert conn.execute("pragma journal_mode").fetchone()[0] == "wal"
    assert conn.execute("pragma busy_timeout").fetchone()[0] == 5000


def test_snapshots_for_mixes_sources_in_ts_order(conn, colega):
    r = store.create_reading(conn, "Duna")
    store.add_snapshot(conn, colega.id, "manual", 0.5, 200, reading_id=r)
    store.add_snapshot(conn, colega.id, "goodreads", 0.4, 100, document="gr:1", external_id="g1")
    store.link_document(conn, "gr:1", r)
    assert [s.percentage for s in store.snapshots_for(conn, colega.id, r)] == [0.4, 0.5]


def test_set_cover_unknown_id(conn):
    with pytest.raises(KeyError):
        store.set_cover(conn, 999, "u")


def test_connect_adds_cover_url_column_to_old_db(tmp_path):
    import sqlite3

    from bookrats import db

    path = str(tmp_path / "old.db")
    raw = sqlite3.connect(path)
    raw.execute(
        "CREATE TABLE readings (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT,"
        " goodreads_book_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)"
    )
    raw.commit()
    raw.close()
    c = db.connect(path)
    cols = [r[1] for r in c.execute("pragma table_info(readings)")]
    c.close()
    assert "cover_url" in cols


def test_connect_adds_users_color_column_to_old_db(tmp_path):
    import sqlite3

    from bookrats import db

    path = str(tmp_path / "old2.db")
    raw = sqlite3.connect(path)
    raw.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,"
        " kosync_username TEXT, kosync_key TEXT, goodreads_user_id TEXT, api_token TEXT NOT NULL UNIQUE)"
    )
    raw.commit()
    raw.close()
    c = db.connect(path)
    cols = [r[1] for r in c.execute("pragma table_info(users)")]
    c.close()
    assert "color" in cols


def test_set_color_roundtrip(conn, davi):
    store.set_color(conn, davi.id, "verde")
    assert conn.execute("select color from users where id=?", (davi.id,)).fetchone()[0] == "verde"


def test_claim_color_only_first_wins_across_connections(db_path, conn, davi, colega):
    from bookrats import db

    c2 = db.connect(db_path)
    try:
        assert store.claim_color(conn, davi.id, "verde") is True
        assert store.claim_color(c2, colega.id, "verde") is False
        assert store.claim_color(c2, colega.id, "roxo") is True
    finally:
        c2.close()


def test_init_schema_partial_and_duplicate_column_race(tmp_path):
    import sqlite3

    from bookrats import db

    p = str(tmp_path / "p.db")
    c1 = sqlite3.connect(p)
    c1.executescript(db.SCHEMA)
    c1.commit()
    c2 = db.connect(p)  # adds missing columns
    c1.row_factory = sqlite3.Row
    db.init_schema(c1)  # second connection sees columns already present; must not raise
    db.init_schema(c2)
    # simulate a stale pragma view: another connection added the column between check and ALTER
    c3 = sqlite3.connect(p)
    db._add_column(c3, "users", "color", "TEXT")
    cols = [r[1] for r in c3.execute("pragma table_info(users)")]
    assert cols.count("color") == 1
