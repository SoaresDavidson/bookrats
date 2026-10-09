import httpx
import pytest

from bookrats import store

AUTH = {"Authorization": "Bearer t-davi"}
COVER = "https://covers.openlibrary.org/b/id/12345-L.jpg"


def _two(conn, davi, colega):
    a = store.create_reading(conn, "Antigo", "Autor A")
    store.add_snapshot(conn, davi.id, "kosync", 1.0, 1000, document="ha", reading_id=a)
    store.add_snapshot(conn, colega.id, "manual", 1.0, 2000, reading_id=a)
    b = store.create_reading(conn, "Novo", "Autor B")
    store.add_snapshot(conn, davi.id, "manual", .41, 3000, reading_id=b)
    return a, b


def _list(client):
    return client.get("/api/readings", headers=AUTH).json()


def _mock(client, handler):
    client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_list_requires_token(client, davi):
    assert client.get("/api/readings").status_code == 401


def test_list_active_first_with_readers(client, conn, davi, colega):
    a, b = _two(conn, davi, colega)
    rows = _list(client)
    assert [r["id"] for r in rows] == [b, a]
    assert rows[0]["active"] is True and rows[1]["active"] is False
    assert set(rows[0]) == {"id", "title", "author", "cover_url", "goodreads_book_id",
                            "active", "created_at", "status", "readers"}
    assert set(rows[0]["readers"][0]) == {"name", "percentage", "updated_at", "started_at", "finished_at"}
    assert rows[0]["title"] == "Novo" and rows[0]["author"] == "Autor B"
    assert [x["percentage"] for x in rows[1]["readers"]] == [1.0, 1.0]
    assert [x["name"] for x in rows[1]["readers"]] == ["Davi", "Colega"]
    assert [x["percentage"] for x in rows[0]["readers"]] == [pytest.approx(.41), None]
    assert rows[0]["readers"][1]["updated_at"] is None
    assert rows[1]["readers"][0]["updated_at"] == "1970-01-01T00:16:40Z"
    assert rows[0]["created_at"].endswith("Z")


def test_list_inactive_ordered_by_recent_progress_then_created(client, conn, davi, colega):
    x = store.create_reading(conn, "X")
    y = store.create_reading(conn, "Y")
    z = store.create_reading(conn, "Z")
    w = store.create_reading(conn, "W")  # active, no progress
    store.add_snapshot(conn, davi.id, "manual", .1, 500, reading_id=x)
    store.add_snapshot(conn, davi.id, "manual", .1, 900, reading_id=y)
    conn.execute("UPDATE readings SET created_at=10 WHERE id=?", (z,))
    conn.commit()
    assert [r["id"] for r in _list(client)] == [w, y, x, z]


def test_activate_switches(client, conn, davi, colega):
    a, b = _two(conn, davi, colega)
    assert client.post(f"/api/readings/{a}/activate", headers=AUTH).status_code == 204
    assert client.get("/api/summary", headers=AUTH).json()["reading"]["id"] == a
    rows = _list(client)
    assert [r["active"] for r in rows].count(True) == 1 and rows[0]["id"] == a


def test_activate_unknown_404(client, davi):
    assert client.post("/api/readings/999/activate", headers=AUTH).status_code == 404


def test_activate_requires_token(client, conn, davi):
    r = store.create_reading(conn, "X")
    assert client.post(f"/api/readings/{r}/activate").status_code == 401


def test_patch_partial_title_only(client, conn, davi):
    r = store.create_reading(conn, "Velho", "Autor")
    assert client.patch(f"/api/readings/{r}", headers=AUTH, json={"title": "X"}).status_code == 204
    row = _list(client)[0]
    assert row["title"] == "X" and row["author"] == "Autor"


def test_patch_author_and_unknown_404(client, conn, davi):
    r = store.create_reading(conn, "T", "A")
    assert client.patch(f"/api/readings/{r}", headers=AUTH, json={"author": "B"}).status_code == 204
    assert _list(client)[0]["author"] == "B" and _list(client)[0]["title"] == "T"
    assert client.patch("/api/readings/999", headers=AUTH, json={"title": "X"}).status_code == 404


@pytest.mark.parametrize("body", [
    {"title": ""}, {"title": "a" * 201}, {"cover_url": "javascript:x"},
])
def test_patch_validation_422(client, conn, davi, body):
    r = store.create_reading(conn, "T")
    assert client.patch(f"/api/readings/{r}", headers=AUTH, json=body).status_code == 422


def test_patch_title_200_ok(client, conn, davi):
    r = store.create_reading(conn, "T")
    assert client.patch(f"/api/readings/{r}", headers=AUTH, json={"title": "a" * 200}).status_code == 204


def test_patch_goodreads_id_links_document(client, conn, davi):
    store.add_snapshot(conn, davi.id, "goodreads", .5, 100, document="gr:777", title="Hail Mary")
    r = store.create_reading(conn, "T")
    assert store.snapshots_for(conn, davi.id, r) == []
    assert client.patch(f"/api/readings/{r}", headers=AUTH, json={"goodreads_book_id": "777"}).status_code == 204
    assert [s.document for s in store.snapshots_for(conn, davi.id, r)] == ["gr:777"]
    assert _list(client)[0]["goodreads_book_id"] == "777"


def _doc(conn, davi, h, title, authors=None):
    store.add_snapshot(conn, davi.id, "kosync", .2, 100, document=h, title=title, authors=authors)


def test_start_from_kosync_document(client, conn, davi):
    old = store.create_reading(conn, "Velho")
    _doc(conn, davi, "hk", "Messias de Duna", "Frank Herbert")
    r = client.post("/api/documents/hk/start", headers=AUTH, json={})
    assert r.status_code == 201
    rid = r.json()["id"]
    assert rid != old
    s = client.get("/api/summary", headers=AUTH).json()["reading"]
    assert s["id"] == rid and s["title"] == "Messias de Duna" and s["author"] == "Frank Herbert"
    assert [x.document for x in store.snapshots_for(conn, davi.id, rid)] == ["hk"]
    assert store.unlinked_documents(conn) == []


def test_start_from_goodreads_document_sets_book_id(client, conn, davi):
    store.add_snapshot(conn, davi.id, "goodreads", .3, 100, document="gr:1234", title="Projeto Hail Mary")
    rid = client.post("/api/documents/gr%3A1234/start", headers=AUTH, json={}).json()["id"]
    row = next(x for x in _list(client) if x["id"] == rid)
    assert row["goodreads_book_id"] == "1234" and row["title"] == "Projeto Hail Mary" and row["active"]


def test_start_without_title_422(client, conn, davi):
    _doc(conn, davi, "hn", None)
    assert client.post("/api/documents/hn/start", headers=AUTH, json={}).status_code == 422
    assert [d["hash"] for d in store.unlinked_documents(conn)] == ["hn"]


def test_start_unknown_404(client, davi):
    assert client.post("/api/documents/zz/start", headers=AUTH, json={}).status_code == 404


def test_start_requires_token(client, conn, davi):
    _doc(conn, davi, "hk", "T")
    assert client.post("/api/documents/hk/start", json={}).status_code == 401


def test_start_resolves_cover(client, conn, davi):
    _doc(conn, davi, "hk", "Duna", "Frank Herbert")
    _mock(client, lambda r: httpx.Response(200, json={"docs": [{"title": "Duna", "cover_i": 12345}]}))
    client.post("/api/documents/hk/start", headers=AUTH, json={})
    assert _list(client)[0]["cover_url"] == COVER


def test_started_finished_and_status(client, conn, davi, colega):
    r = store.create_reading(conn, "Duna")
    store.add_snapshot(conn, davi.id, "manual", .1, 1000, reading_id=r)
    store.add_snapshot(conn, davi.id, "manual", .995, 5000, reading_id=r)
    store.add_snapshot(conn, davi.id, "manual", 1.0, 9000, reading_id=r)
    store.add_snapshot(conn, colega.id, "manual", .5, 2000, reading_id=r)
    store.create_reading(conn, "Outro")  # makes r inactive
    row = next(x for x in _list(client) if x["id"] == r)
    d, c = row["readers"]
    assert d["started_at"] == "1970-01-01T00:16:40Z"
    assert d["finished_at"] == "1970-01-01T01:23:20Z"  # first snapshot >= .99
    assert c["started_at"] == "1970-01-01T00:33:20Z" and c["finished_at"] is None
    assert row["status"] == "pausado"


def test_status_lido_and_lendo(client, conn, davi, colega):
    r = store.create_reading(conn, "Duna")
    store.add_snapshot(conn, davi.id, "manual", 1.0, 1000, reading_id=r)
    store.add_snapshot(conn, colega.id, "manual", .99, 2000, reading_id=r)
    assert _list(client)[0]["status"] == "lendo"
    store.create_reading(conn, "Outro")
    row = next(x for x in _list(client) if x["id"] == r)
    assert row["status"] == "lido"


def test_no_snapshots_nulls(client, conn, davi, colega):
    store.create_reading(conn, "X")
    row = _list(client)[0]
    assert all(x["started_at"] is None and x["finished_at"] is None for x in row["readers"])
