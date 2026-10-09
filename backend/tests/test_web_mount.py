from fastapi.testclient import TestClient

from bookrats.main import create_app


def test_app_served_when_dist_exists(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>bookrats-web</html>")
    monkeypatch.setenv("BOOKRATS_WEB_DIST", str(dist))
    with TestClient(create_app(str(tmp_path / "t.db"), start_poller=False)) as c:
        r = c.get("/app/")
        assert r.status_code == 200
        assert "bookrats-web" in r.text
        r = c.get("/", follow_redirects=False)
        assert r.status_code == 307
        assert r.headers["location"] == "/app/"


def test_no_mount_without_dist(tmp_path, monkeypatch):
    monkeypatch.setenv("BOOKRATS_WEB_DIST", str(tmp_path / "missing"))
    with TestClient(create_app(str(tmp_path / "t.db"), start_poller=False)) as c:
        assert c.get("/app/").status_code == 404
        assert c.get("/", follow_redirects=False).status_code == 404
        assert c.get("/healthcheck").status_code == 200
