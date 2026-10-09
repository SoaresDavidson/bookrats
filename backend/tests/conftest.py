import httpx
import pytest
from fastapi.testclient import TestClient

from bookrats import db, store
from bookrats.main import create_app


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture
def client(db_path):
    app = create_app(db_path, start_poller=False)
    with TestClient(app) as c:
        app.state.http = httpx.AsyncClient(
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"docs": []}))
        )
        yield c


@pytest.fixture
def conn(db_path, client):
    c = db.connect(db_path)
    yield c
    c.close()


@pytest.fixture
def davi(conn):
    return store.add_user(conn, "Davi", "t-davi", kosync_username="davi", kosync_key="md5x")


@pytest.fixture
def colega(conn):
    return store.add_user(conn, "Colega", "t-colega", goodreads_user_id="123")
