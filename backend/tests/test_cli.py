import hashlib

from bookrats import db, store
from bookrats.cli import main


def _setup(monkeypatch, tmp_path):
    path = tmp_path / "t.db"
    monkeypatch.setenv("BOOKRATS_DB", str(path))
    return path


def test_add_user_kosync_stores_md5(monkeypatch, tmp_path, capsys):
    path = _setup(monkeypatch, tmp_path)
    rc = main(["add-user", "--name", "D", "--kosync-user", "d", "--kosync-password", "pw"])
    assert rc == 0
    out = capsys.readouterr().out
    conn = db.connect(path)
    user = store.user_by_kosync(conn, "d", hashlib.md5(b"pw").hexdigest())
    assert user is not None
    assert user.api_token in out
    assert store.user_by_token(conn, user.api_token) is not None


def test_add_user_goodreads(monkeypatch, tmp_path):
    path = _setup(monkeypatch, tmp_path)
    assert main(["add-user", "--name", "Colega", "--goodreads-id", "123456"]) == 0
    users = store.list_users(db.connect(path))
    assert len(users) == 1
    u = users[0]
    assert u.name == "Colega"
    assert u.goodreads_user_id == "123456"
    assert u.kosync_username is None
    assert u.kosync_key is None


def test_tokens_are_unique_and_long(monkeypatch, tmp_path):
    path = _setup(monkeypatch, tmp_path)
    assert main(["add-user", "--name", "A", "--goodreads-id", "1"]) == 0
    assert main(["add-user", "--name", "B", "--goodreads-id", "2"]) == 0
    tokens = [u.api_token for u in store.list_users(db.connect(path))]
    assert len(tokens) == 2 and tokens[0] != tokens[1]
    assert all(len(t) >= 32 for t in tokens)


def test_duplicate_name_fails_cleanly(monkeypatch, tmp_path, capsys):
    _setup(monkeypatch, tmp_path)
    assert main(["add-user", "--name", "Davi", "--goodreads-id", "1"]) == 0
    capsys.readouterr()
    assert main(["add-user", "--name", "Davi", "--goodreads-id", "2"]) != 0
    assert "Davi" in capsys.readouterr().err


def test_new_reading(monkeypatch, tmp_path):
    path = _setup(monkeypatch, tmp_path)
    rc = main(["new-reading", "--title", "Duna", "--author", "Frank Herbert", "--goodreads-book-id", "44767458"])
    assert rc == 0
    r = store.active_reading(db.connect(path))
    assert r["title"] == "Duna"
    assert r["goodreads_book_id"] == "44767458"


def test_password_not_echoed(monkeypatch, tmp_path, capsys):
    _setup(monkeypatch, tmp_path)
    main(["add-user", "--name", "D", "--kosync-user", "d", "--kosync-password", "s3cret-pw"])
    cap = capsys.readouterr()
    assert "s3cret-pw" not in cap.out + cap.err


def test_set_goodreads_links_existing_user(monkeypatch, tmp_path, capsys):
    path = _setup(monkeypatch, tmp_path)
    assert main(["add-user", "--name", "Colega"]) == 0
    token = store.list_users(db.connect(path))[0].api_token
    capsys.readouterr()
    assert main(["set-goodreads", "--name", "Colega", "--goodreads-id", "123456"]) == 0
    assert "123456" in capsys.readouterr().out
    u = store.list_users(db.connect(path))[0]
    assert u.goodreads_user_id == "123456"
    assert u.api_token == token


def test_set_goodreads_unknown_user_fails_cleanly(monkeypatch, tmp_path, capsys):
    _setup(monkeypatch, tmp_path)
    assert main(["set-goodreads", "--name", "Ninguem", "--goodreads-id", "1"]) != 0
    assert "Ninguem" in capsys.readouterr().err
