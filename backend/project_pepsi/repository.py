import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .contracts import ListingIngest, WatchAnalysis
from .database import ScannerCandidate


def source_listing_id(url: str) -> str:
    match = re.search(r"/marketplace/item/([^/?#]+)", url, re.I)
    return match.group(1) if match else url


def save_analysis(session: Session, listing: ListingIngest, analysis: WatchAnalysis) -> ScannerCandidate:
    key = source_listing_id(str(listing.url))
    candidate = session.scalar(select(ScannerCandidate).where(ScannerCandidate.source == "facebook_marketplace", ScannerCandidate.source_listing_id == key))
    if candidate is None:
        candidate = ScannerCandidate(source_listing_id=key, url=str(listing.url), title=listing.title)
        session.add(candidate)
    candidate.url = str(listing.url); candidate.title = listing.title; candidate.description = listing.rawText
    candidate.asking_price_cents = round(listing.price * 100) if listing.price is not None else None
    candidate.location_text = listing.locationText; candidate.distance_miles = listing.distanceMiles
    candidate.raw_payload = listing.model_dump(mode="json", exclude={"images"})
    candidate.image_metadata = [image.model_dump(exclude={"dataUrl"}) for image in listing.images]
    candidate.analysis = analysis.model_dump(mode="json")
    session.commit(); session.refresh(candidate)
    return candidate
