PALETTE: dict[str, tuple[str, str]] = {
    "azul": ("#2F6FEB", "#6F9CF5"),
    "laranja": ("#E8590C", "#FF8A4C"),
    "verde": ("#2B8A3E", "#51CF66"),
    "roxo": ("#7048E8", "#9775FA"),
    "rosa": ("#D6336C", "#F06595"),
    "ciano": ("#0C8599", "#3BC9DB"),
    "ambar": ("#B76E00", "#FCC419"),
    "grafite": ("#495057", "#ADB5BD"),
}
LABELS: dict[str, str] = {
    "azul": "Azul", "laranja": "Laranja", "verde": "Verde", "roxo": "Roxo",
    "rosa": "Rosa", "ciano": "Ciano", "ambar": "Âmbar", "grafite": "Grafite",
}
DEFAULT_ORDER = ["azul", "laranja"]


def effective_color(user, index: int) -> str:
    return user.color or DEFAULT_ORDER[index % len(DEFAULT_ORDER)]


import colorsys
import re

LIGHT_TRACK, DARK_TRACK = "#e4e4e7", "#313137"
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def is_hex(v: str) -> bool:
    return _HEX.fullmatch(v) is not None


def _lum(h: str) -> float:
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a: str, b: str) -> float:
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _adjust(hex_: str, track: str, direction: int) -> str:
    if contrast(hex_, track) >= 3:
        return hex_
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    best, best_c = hex_, contrast(hex_, track)
    for step in range(1, 101):
        nl = min(1.0, max(0.0, l + direction * step * 0.01))
        out = "#%02x%02x%02x" % tuple(round(x * 255) for x in colorsys.hls_to_rgb(h, nl, s))
        c = contrast(out, track)
        if c >= 3:
            return out
        if c > best_c:
            best, best_c = out, c
    return best


def derive(hex_: str) -> tuple[str, str]:
    hex_ = hex_.lower()
    return _adjust(hex_, LIGHT_TRACK, -1), _adjust(hex_, DARK_TRACK, +1)


def resolve(value: str) -> tuple[str, str, str]:
    """Stored color value (palette id or #hex) -> (id, light, dark)."""
    if value in PALETTE:
        return (value, *PALETTE[value])
    light, dark = derive(value)
    return ("custom", light, dark)
