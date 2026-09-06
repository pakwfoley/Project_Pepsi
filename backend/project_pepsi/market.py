from datetime import datetime, timezone
from statistics import median
from urllib.parse import urlsplit, urlunsplit

from .contracts import Identification, MarketEvidence, MarketObservation


def build_comp_queries(identity: Identification) -> list[str]:
    base = " ".join(part.strip() for part in (identity.brand, identity.model) if part.strip())
    exact = " ".join(part for part in (base, identity.reference.strip()) if part)
    stem = exact or base
    return list(dict.fromkeys([f"{stem} sold price", f"{stem} completed sale", f"{stem} for sale"]))


def _canonical_url(url: str) -> str:
    parsed = urlsplit(url)
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/"), "", ""))


def normalize_observations(observations: list[MarketObservation], subject_url: str, retrieved_urls: set[str] | None = None) -> list[MarketObservation]:
    subject = _canonical_url(subject_url)
    allowed = {_canonical_url(url) for url in retrieved_urls} if retrieved_urls else None
    seen: set[tuple[str, int, str]] = set()
    result: list[MarketObservation] = []
    for observation in observations:
        url = _canonical_url(str(observation.url))
        key = (url, round(observation.priceUsd * 100), observation.status)
        if not observation.relevant or url == subject or key in seen or (allowed is not None and url not in allowed):
            continue
        if observation.currency.upper() != observation.currency:
            observation = observation.model_copy(update={"currency": observation.currency.upper()})
        seen.add(key)
        result.append(observation)
    return result[:12]


def summarize_evidence(queries: list[str], observations: list[MarketObservation]) -> MarketEvidence:
    sold = [item.priceUsd for item in observations if item.status == "sold"]
    asking = [item.priceUsd for item in observations if item.status == "asking"]
    return MarketEvidence(
        retrievedAt=datetime.now(timezone.utc),
        queries=queries,
        observations=observations,
        compsFound=len(observations),
        soldComps=len(sold),
        askingComps=len(asking),
        medianSold=median(sold) if sold else None,
        medianAsk=median(asking) if asking else None,
    )
