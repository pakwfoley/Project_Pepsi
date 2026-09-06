import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .contracts import ListingIngest, ManualListingInput, WatchAnalysis
from .database import Listing, ScannerCandidate, Valuation


def source_listing_id(url: str) -> str:
    match = re.search(r"/marketplace/item/([^/?#]+)", url, re.I)
    return match.group(1) if match else url


def save_analysis(session: Session, owner_id: str, listing: ListingIngest, analysis: WatchAnalysis, analysis_metadata: dict | None = None) -> ScannerCandidate:
    key = listing.sourceListingId or source_listing_id(str(listing.url))
    candidate = session.scalar(select(ScannerCandidate).where(ScannerCandidate.owner_id == owner_id, ScannerCandidate.source == listing.source, ScannerCandidate.source_listing_id == key))
    if candidate is None:
        candidate = ScannerCandidate(owner_id=owner_id, source=listing.source, source_listing_id=key, url=str(listing.url), title=listing.title)
        session.add(candidate)
    candidate.url = str(listing.url); candidate.title = listing.title; candidate.description = listing.rawText
    candidate.asking_price_cents = round(listing.price * 100) if listing.price is not None else None
    candidate.location_text = listing.locationText; candidate.distance_miles = listing.distanceMiles
    candidate.raw_payload = listing.model_dump(mode="json", exclude={"images"})
    candidate.image_metadata = [image.model_dump(exclude={"dataUrl"}) for image in listing.images]
    candidate.analysis = analysis.model_dump(mode="json")
    candidate.analysis_metadata = analysis_metadata or {}
    session.commit(); session.refresh(candidate)
    return candidate


def save_manual_listing(session: Session, owner_id: str, payload: ManualListingInput, source: str, confidence: float, economics: dict[str, int]) -> Listing:
    listing = Listing(owner_id=owner_id, url=str(payload.url), source=source, raw_text=payload.rawText, brand=payload.brand.strip(), model=payload.model.strip(), reference=payload.reference.strip().upper(), ask_cents=economics["ask"], normalization_confidence=confidence)
    session.add(listing)
    session.flush()
    session.add(Valuation(listing_id=listing.id, received_qlv_cents=economics["received"], given_qlv_cents=economics["given"], cash_paid_cents=economics["cash"], cost_cents=economics["costs"], expected_risk_loss_cents=economics["risk"], liquidity_adjustment_cents=economics["liquidity"], economic_alpha_cents=economics["alpha"], strategic_score_cents=economics["strategic"], dealer_ask_median_cents=economics["dealer_ask"], private_ask_median_cents=economics["private_ask"], clearing_estimate_cents=economics["clearing"], qlv_haircut_bps=payload.qlvHaircutBps))
    session.commit()
    return listing
