EXPECTED = [
    ("azul", "#2F6FEB", "#6F9CF5"), ("laranja", "#D9480F", "#FF8A4C"),
    ("verde", "#2B8A3E", "#51CF66"), ("roxo", "#7048E8", "#9775FA"),
    ("rosa", "#D6336C", "#F06595"), ("ciano", "#0C8599", "#3BC9DB"),
    ("ambar", "#B76E00", "#FCC419"), ("grafite", "#495057", "#ADB5BD"),
]


def test_palette_endpoint_order_and_values(client, davi):
    r = client.get("/api/palette", headers={"Authorization": "Bearer t-davi"})
    assert r.status_code == 200
    assert r.json() == [{"id": i, "light": l, "dark": d} for i, l, d in EXPECTED]


def test_palette_requires_auth(client, davi):
    assert client.get("/api/palette").status_code == 401


def test_laranja_light_contrast_vs_track():
    from bookrats.palette import PALETTE, LIGHT_TRACK, contrast
    assert contrast(PALETTE["laranja"][0], LIGHT_TRACK) >= 3
