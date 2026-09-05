import re

from sqlalchemy.orm import Session

from .contracts import ManualListingInput
from .repository import save_manual_listing


def _cents(value: float) -> int:
    return round(value * 100)


def create_manual_listing(session: Session, payload: ManualListingInput) -> dict:
    host = str(payload.url).lower()
    source = next((name for name in ("reddit", "ebay", "facebook") if name in host), "manual")
    confidence = 0.96 if re.match(r"^(?:\d{3}(?:\.\d+)+|[A-Z]\d{4,})", payload.reference, re.I) else 0.78
    received, given, cash, costs, risk, liquidity = map(_cents, [payload.receivedQlv, payload.givenQlv, payload.cashPaid, payload.costs, payload.riskPenalty, payload.liquidityBonus])
    alpha = received - given - cash - costs - risk
    economics = {"ask": _cents(payload.ask), "received": received, "given": given, "cash": cash, "costs": costs, "risk": risk, "liquidity": liquidity, "alpha": alpha, "strategic": alpha + liquidity, "dealer_ask": _cents(payload.dealerAskMedian), "private_ask": _cents(payload.privateAskMedian), "clearing": _cents(payload.clearingEstimate)}
    listing = save_manual_listing(session, payload, source, confidence, economics)
    return {"id": listing.id, "economicAlpha": alpha / 100, "strategicScore": (alpha + liquidity) / 100, "confidence": confidence}
