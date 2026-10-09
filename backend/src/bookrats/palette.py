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
