import re
from urllib.parse import unquote


BRANDS = ["Rolex", "Omega", "Tudor", "Breitling", "Cartier", "IWC", "Grand Seiko", "Longines", "Hamilton", "Tag Heuer"]
MODELS = {
    "Rolex": ["GMT-Master II", "Submariner", "Explorer", "Datejust", "Daytona"],
    "Omega": ["Seamaster Diver 300M", "Seamaster", "Speedmaster", "Aqua Terra"],
    "Tudor": ["Black Bay 58", "Black Bay", "Pelagos", "Ranger"],
    "Breitling": ["Navitimer", "Superocean"], "Cartier": ["Santos", "Tank"],
    "IWC": ["Pilot", "Portugieser"], "Grand Seiko": ["Heritage", "Evolution 9"],
    "Longines": ["Spirit", "HydroConquest"], "Hamilton": ["Khaki Field"],
    "Tag Heuer": ["Carrera", "Monaco"],
}
REFERENCE_PATTERNS = [r"\b\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{3}\b", r"\bM?\d{4,6}[A-Z]{0,3}(?:-\d{4})?\b", r"\b[A-Z]{2,4}\d{3,6}[A-Z0-9.-]*\b"]


def normalize_listing(url: str, text: str) -> dict:
    corpus = re.sub(r"[_-]+", " ", f"{text} {unquote(url)}")
    brand = next((value for value in BRANDS if re.search(rf"\b{re.escape(value)}\b", corpus, re.I)), "")
    model = next((value for value in MODELS.get(brand, []) if value.lower() in corpus.lower()), "")
    reference = next((match.group(0).upper() for pattern in REFERENCE_PATTERNS if (match := re.search(pattern, corpus, re.I))), "")
    prices = [float(value.replace(",", "")) for value in re.findall(r"(?:\$|USD\s*)\s*((?:[1-9]\d{0,2}(?:,\d{3})+)|(?:[1-9]\d{2,5}))", corpus, re.I)]
    ask = next((value for value in prices if 200 <= value <= 250_000), None)
    values = [brand, model, reference, ask]
    return {"brand": brand, "model": model, "reference": reference, "ask": ask, "source": "submitted", "fetched": False, "warning": "", "confidence": round(sum(bool(value) for value in values) / 4, 2), "evidence": [value for value in [f'Brand “{brand}” found' if brand else "", f'Model “{model}” found' if model else "", f'Reference pattern “{reference}” found' if reference else "", f"First explicit asking price {ask:g}" if ask else ""] if value], "missing": [name for name, value in zip(["brand", "model", "reference", "asking price"], values) if not value]}
