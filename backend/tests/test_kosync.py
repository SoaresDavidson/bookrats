from bookrats import store

H = {"x-auth-user": "davi", "x-auth-key": "md5x"}


def test_auth_ok(client, davi): assert client.get("/users/auth", headers=H).json() == {"authorized": "OK"}
def test_auth_bad(client, davi): assert client.get("/users/auth", headers={**H, "x-auth-key": "no"}).status_code == 401
def test_register_disabled(client): assert client.post("/users/create", json={"username": "x", "password": "y"}).status_code == 402
def test_put_then_get_roundtrip(client, davi):
    body = {"document": "h1", "progress": "/body/DocFragment[3]", "percentage": 0.42, "device": "Kindle", "device_id": "k1"}
    assert client.put("/syncs/progress", json=body, headers=H).status_code == 200
    got = client.get("/syncs/progress/h1", headers=H).json()
    assert got["percentage"] == 0.42 and got["progress"] == "/body/DocFragment[3]"
def test_put_rejects_bad_percentage(client, davi):
    assert client.put("/syncs/progress", json={"document": "h1", "progress": "x", "percentage": 1.5, "device": "d", "device_id": "d"}, headers=H).status_code == 400
def test_get_unknown_document_is_empty(client, davi): assert client.get("/syncs/progress/zz", headers=H).json() == {}
def test_put_accepts_crosspoint_extensions(client, conn, davi):
    body = {"document": "h2", "progress": "x", "percentage": 0.1, "device": "CrossPoint", "device_id": "crosspoint-reader",
            "metadata": {"filename": "duna.epub", "title": "Duna", "authors": "Frank Herbert"}, "position": {"pctQ": 1, "spine": 2}}
    assert client.put("/syncs/progress", json=body, headers=H).status_code == 200
    assert conn.execute("select title from documents where hash='h2'").fetchone()[0] == "Duna"
def test_put_stores_history(client, conn, davi):
    for p in (0.1, 0.2):
        client.put("/syncs/progress", json={"document": "h1", "progress": "x", "percentage": p, "device": "d", "device_id": "d"}, headers=H)
    assert conn.execute("select count(*) from snapshots where document='h1'").fetchone()[0] == 2


def _body(doc="h1", pct=0.3):
    return {"document": doc, "progress": "x", "percentage": pct, "device": "d", "device_id": "dev1"}


def test_healthcheck(client):
    r = client.get("/healthcheck")
    assert r.status_code == 200 and r.json() == {"state": "OK"}


def test_put_without_auth_is_401(client, davi):
    r = client.put("/syncs/progress", json=_body())
    assert r.status_code == 401 and r.json() == {"code": 2001, "message": "Unauthorized"}


def test_put_missing_document_is_400(client, davi):
    body = _body()
    del body["document"]
    r = client.put("/syncs/progress", json=body, headers=H)
    assert r.status_code == 400 and r.json() == {"code": 2003, "message": "Invalid request"}


def test_get_returns_newest_put(client, davi):
    client.put("/syncs/progress", json=_body(pct=0.2), headers=H)
    client.put("/syncs/progress", json=_body(pct=0.6), headers=H)
    got = client.get("/syncs/progress/h1", headers=H).json()
    assert got["percentage"] == 0.6
    assert got["device_id"] == "dev1"
    assert isinstance(got["timestamp"], int)


def test_put_response_shape(client, davi):
    r = client.put("/syncs/progress", json=_body(), headers=H)
    j = r.json()
    assert set(j) == {"document", "timestamp"} and j["document"] == "h1" and isinstance(j["timestamp"], int)


def test_users_are_isolated(client, conn, davi, colega):
    store.add_user(conn, "Outro", "t-outro", kosync_username="outro", kosync_key="k2")
    client.put("/syncs/progress", json=_body(), headers=H)
    r = client.get("/syncs/progress/h1", headers={"x-auth-user": "outro", "x-auth-key": "k2"})
    assert r.json() == {}


def test_basic_authorization_header_is_ignored(client, davi):
    r = client.get("/users/auth", headers={**H, "Authorization": "Basic ZGF2aTpwdw=="})
    assert r.status_code == 200
