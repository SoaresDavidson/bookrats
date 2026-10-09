import pytest

from bookrats import store

AUTH = {"Authorization": "Bearer t-davi"}
AUTH_C = {"Authorization": "Bearer t-colega"}
SNAPS = [(.30, 0), (.34, 600), (.36, 5000), (.41, 5600)]


def _seed(conn, davi, author=None):
    r = store.create_reading(conn, "Duna", author)
    for p, ts in SNAPS:
        store.add_snapshot(conn, davi.id, "kosync", p, ts, document="h1")
    store.link_document(conn, "h1", r)
    return r


def test_requires_token(client): assert client.get("/api/summary").status_code == 401
def test_summary_without_reading(client, davi, colega):
    j = client.get("/api/summary", headers=AUTH).json()
    assert j["reading"] is None and [r["percentage"] for r in j["readers"]] == [None, None]
def test_summary_latest_and_last_session(client, conn, davi, colega):
    r = store.create_reading(conn, "Duna")
    for p, ts in [(.30, 0), (.34, 600), (.36, 5000), (.41, 5600)]:
        store.add_snapshot(conn, davi.id, "kosync", p, ts, document="h1")
    store.link_document(conn, "h1", r)
    d = client.get("/api/summary", headers=AUTH).json()["readers"][0]
    assert d["percentage"] == .41 and d["last_session"]["from"] == .34 and d["last_session"]["to"] == .41
def test_manual_progress_needs_reading(client, colega):
    assert client.post("/api/progress", json={"percentage": .2}, headers={"Authorization": "Bearer t-colega"}).status_code == 409
def test_link_unknown_hash_404(client, conn, davi):
    r = store.create_reading(conn, "X"); assert client.post("/api/documents/zz/link", json={"reading_id": r}, headers=AUTH).status_code == 404


def test_summary_me_and_readers_order(client, davi, colega):
    assert client.get("/api/summary", headers=AUTH).json()["me"] == "Davi"
    j = client.get("/api/summary", headers=AUTH_C).json()
    assert j["me"] == "Colega"
    assert [r["name"] for r in j["readers"]] == ["Davi", "Colega"]


def test_summary_reading_object(client, conn, davi, colega):
    r = store.create_reading(conn, "Duna", "Frank Herbert")
    assert client.get("/api/summary", headers=AUTH).json()["reading"] == {"id": r, "title": "Duna", "author": "Frank Herbert"}


def test_summary_reader_fields(client, conn, davi, colega):
    _seed(conn, davi)
    d, c = client.get("/api/summary", headers=AUTH).json()["readers"]
    assert d["percentage"] == pytest.approx(.41)
    assert d["updated_at"] == "1970-01-01T01:33:20Z"
    assert d["source"] == "kosync"
    assert c["percentage"] is None and c["updated_at"] is None
    assert c["source"] is None and c["last_session"] is None


def test_last_session_shape(client, conn, davi, colega):
    _seed(conn, davi)
    ls = client.get("/api/summary", headers=AUTH).json()["readers"][0]["last_session"]
    assert set(ls) == {"from", "to", "started_at", "ended_at"}
    assert ls["started_at"] == "1970-01-01T01:23:20Z"
    assert ls["ended_at"] == "1970-01-01T01:33:20Z"


def test_sessions_limit_and_order(client, conn, davi, colega):
    _seed(conn, davi)
    one = client.get("/api/sessions?user=Davi&limit=1", headers=AUTH).json()
    assert len(one) == 1
    assert one[0]["from"] == pytest.approx(.34) and one[0]["to"] == pytest.approx(.41)
    both = client.get("/api/sessions?user=Davi", headers=AUTH).json()
    assert len(both) == 2
    assert both[0]["from"] == pytest.approx(.34) and both[0]["to"] == pytest.approx(.41)


def test_sessions_unknown_user_404(client, davi):
    assert client.get("/api/sessions?user=Nobody", headers=AUTH).status_code == 404


def test_post_progress_manual(client, conn, davi, colega):
    store.create_reading(conn, "Duna")
    assert client.post("/api/progress", json={"percentage": .2}, headers=AUTH_C).status_code == 201
    c = client.get("/api/summary", headers=AUTH).json()["readers"][1]
    assert c["percentage"] == pytest.approx(.2) and c["source"] == "manual"


def test_post_progress_out_of_range(client, conn, davi):
    store.create_reading(conn, "Duna")
    assert client.post("/api/progress", json={"percentage": 1.5}, headers=AUTH).status_code in (400, 422)


def test_post_progress_string(client, conn, davi):
    store.create_reading(conn, "Duna")
    assert client.post("/api/progress", json={"percentage": "0.5"}, headers=AUTH).status_code in (400, 422)


def test_post_reading_becomes_active(client, davi):
    resp = client.post("/api/readings", json={"title": "X", "author": "Y", "goodreads_book_id": "1"}, headers=AUTH)
    assert resp.status_code == 201 and isinstance(resp.json()["id"], int)
    assert client.get("/api/summary", headers=AUTH).json()["reading"]["title"] == "X"


def test_unlinked_documents_and_link(client, conn, davi):
    store.add_snapshot(conn, davi.id, "kosync", .1, 100, document="hh", device="Kindle")
    r = store.create_reading(conn, "X")
    docs = client.get("/api/documents/unlinked", headers=AUTH).json()
    assert [d["hash"] for d in docs] == ["hh"]
    assert set(docs[0]) == {"hash", "title", "authors", "last_device", "first_seen"}
    assert client.post("/api/documents/hh/link", json={"reading_id": r}, headers=AUTH).status_code == 204
    assert client.get("/api/documents/unlinked", headers=AUTH).json() == []


def test_link_unknown_reading_404(client, conn, davi):
    store.add_snapshot(conn, davi.id, "kosync", .1, 100, document="hh")
    assert client.post("/api/documents/hh/link", json={"reading_id": 999}, headers=AUTH).status_code == 404


def test_bad_token_401(client, davi):
    assert client.get("/api/summary", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_missing_bearer_prefix_401(client, davi):
    assert client.get("/api/summary", headers={"Authorization": "t-davi"}).status_code == 401


def test_kosync_still_wired(client):
    assert client.get("/healthcheck").status_code == 200
