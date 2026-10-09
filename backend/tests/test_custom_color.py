import pytest

AUTH = {"Authorization": "Bearer t-davi"}
AUTH_C = {"Authorization": "Bearer t-colega"}
LIGHT_TRACK, DARK_TRACK = "#e4e4e7", "#313137"


def _lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _colors(client):
    j = client.get("/api/summary", headers=AUTH).json()
    return {r["name"]: r["color"] for r in j["readers"]}


def test_custom_color_derived(client, davi, colega):
    assert client.put("/api/me/color", headers=AUTH, json={"color": "#A1B2C3"}).status_code == 204
    c = _colors(client)["Davi"]
    assert c["id"] == "custom"
    assert contrast(c["light"], LIGHT_TRACK) >= 3
    assert contrast(c["dark"], DARK_TRACK) >= 3


def test_custom_color_compliant_sides_unchanged(client, davi, colega):
    assert client.put("/api/me/color", headers=AUTH, json={"color": "#2F6FEB"}).status_code == 204
    assert _colors(client)["Davi"]["id"] == "custom"
    assert _colors(client)["Davi"]["light"].lower() == "#2f6feb"
    assert client.put("/api/me/color", headers=AUTH, json={"color": "#6f9cf5"}).status_code == 204
    assert _colors(client)["Davi"]["dark"].lower() == "#6f9cf5"


def test_custom_color_stored_lowercase(client, davi, colega):
    client.put("/api/me/color", headers=AUTH, json={"color": "#2F6FEB"})
    c = _colors(client)["Davi"]
    assert c["id"] == "custom" and c["light"] == c["light"].lower() == "#2f6feb"


@pytest.mark.parametrize("bad", ["#abc", "red", "#12345g", ""])
def test_custom_color_invalid_422(client, davi, colega, bad):
    assert client.put("/api/me/color", headers=AUTH, json={"color": bad}).status_code == 422


def test_custom_color_conflict_with_default_case_insensitive(client, davi, colega):
    r = client.put("/api/me/color", headers=AUTH_C, json={"color": "#2f6feb"})
    assert r.status_code == 409 and "cor em uso" in r.text
    r = client.put("/api/me/color", headers=AUTH_C, json={"color": "#2F6FEB"})
    assert r.status_code == 409


def test_custom_color_near_miss_ok(client, davi, colega):
    assert client.put("/api/me/color", headers=AUTH_C, json={"color": "#2f6fec"}).status_code == 204


def test_palette_ids_still_work(client, davi, colega):
    assert client.put("/api/me/color", headers=AUTH, json={"color": "verde"}).status_code == 204
    assert _colors(client)["Davi"] == {"id": "verde", "light": "#2B8A3E", "dark": "#51CF66"}
