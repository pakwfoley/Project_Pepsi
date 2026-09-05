import hmac
import logging
import time
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .contracts import ManualListingInput, NormalizeInput, TradeEconomicsInput, parse_listing_submission
from .database import Listing, ScannerCandidate, Valuation, get_session
from .economics import calculate_trade_economics
from .normalization import normalize_listing
from .openai_client import OpenAIConfigurationError, OpenAIResponseError, analyze_listing
from .repository import save_analysis

settings = get_settings()
logger = logging.getLogger("project_pepsi")
app = FastAPI(title="Project Pepsi API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_origin_regex=r"chrome-extension://.*", allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["content-type"])


def require_service_token(authorization: str = Header(default="")) -> None:
    configured = settings.project_pepsi_api_token.strip()
    if not configured:
        raise HTTPException(status_code=503, detail={"code": "API_TOKEN_MISSING", "error": "Backend authentication is not configured."})
    supplied = authorization.removeprefix("Bearer ").strip()
    if not supplied or not hmac.compare_digest(supplied, configured):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "error": "A valid service token is required."})


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4())); started = time.perf_counter()
    response = await call_next(request); response.headers["x-request-id"] = request_id
    logger.info("request_complete request_id=%s method=%s path=%s status=%s latency_ms=%d", request_id, request.method, request.url.path, response.status_code, (time.perf_counter() - started) * 1000)
    return response


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/analyze")
async def analyze(payload: dict, _auth: None = Depends(require_service_token), session: Session = Depends(get_session)) -> dict:
    try:
        listing, rejected_indexes = parse_listing_submission(payload)
        analysis, metadata = await analyze_listing(listing, settings)
        candidate = save_analysis(session, listing, analysis)
        return {"ok": True, "candidateId": candidate.id, "analysis": analysis, "model": metadata["model"], "responseId": metadata["response_id"], "ingestion": {"contractVersion": 1, "submittedImages": candidate.image_metadata, "rejectedImageIndexes": rejected_indexes}}
    except OpenAIConfigurationError as exc:
        raise HTTPException(status_code=503, detail={"code": str(exc), "error": "OpenAI connectivity is not configured."}) from exc
    except OpenAIResponseError as exc:
        raise HTTPException(status_code=502, detail={"code": str(exc).split(":")[0], "error": "OpenAI analysis failed."}) from exc


@app.get("/api/analyze")
def candidates(_auth: None = Depends(require_service_token), session: Session = Depends(get_session)) -> dict:
    rows = session.scalars(select(ScannerCandidate).order_by(ScannerCandidate.updated_at.desc()).limit(30)).all()
    return {"candidates": [{"id": row.id, "sourceKey": row.source_listing_id, "url": row.url, "title": row.title, "rawText": row.description, "askCents": row.asking_price_cents, "locationText": row.location_text, "distanceMiles": row.distance_miles, "imageMetadata": row.image_metadata, "analysis": row.analysis, "status": row.status, "createdAt": row.created_at, "updatedAt": row.updated_at} for row in rows]}


@app.post("/api/economics")
def economics(payload: TradeEconomicsInput, _auth: None = Depends(require_service_token)) -> dict:
    return calculate_trade_economics(payload).__dict__


@app.post("/api/normalize")
def normalize(payload: NormalizeInput, _auth: None = Depends(require_service_token)) -> dict:
    return normalize_listing(str(payload.url or ""), payload.text)


def _cents(value: float) -> int:
    return round(value * 100)


@app.get("/api/listings")
def listings(_auth: None = Depends(require_service_token), session: Session = Depends(get_session)) -> dict:
    rows = session.execute(select(Listing, Valuation).join(Valuation, Valuation.listing_id == Listing.id).order_by(Listing.created_at.desc()).limit(8)).all()
    return {"listings": [{"id": listing.id, "url": listing.url, "source": listing.source, "brand": listing.brand, "model": listing.model, "reference": listing.reference, "askCents": listing.ask_cents, "confidence": listing.normalization_confidence, "createdAt": listing.created_at, "economicAlphaCents": valuation.economic_alpha_cents, "strategicScoreCents": valuation.strategic_score_cents} for listing, valuation in rows]}


@app.post("/api/listings", status_code=201)
def create_listing(payload: ManualListingInput, _auth: None = Depends(require_service_token), session: Session = Depends(get_session)) -> dict:
    host = str(payload.url).lower()
    source = next((name for name in ("reddit", "ebay", "facebook") if name in host), "manual")
    confidence = 0.96 if __import__("re").match(r"^(?:\d{3}(?:\.\d+)+|[A-Z]\d{4,})", payload.reference, __import__("re").I) else 0.78
    listing = Listing(url=str(payload.url), source=source, raw_text=payload.rawText, brand=payload.brand.strip(), model=payload.model.strip(), reference=payload.reference.strip().upper(), ask_cents=_cents(payload.ask), normalization_confidence=confidence)
    session.add(listing); session.flush()
    received, given, cash, costs, risk, liquidity = map(_cents, [payload.receivedQlv, payload.givenQlv, payload.cashPaid, payload.costs, payload.riskPenalty, payload.liquidityBonus])
    alpha = received - given - cash - costs - risk
    session.add(Valuation(listing_id=listing.id, received_qlv_cents=received, given_qlv_cents=given, cash_paid_cents=cash, cost_cents=costs, expected_risk_loss_cents=risk, liquidity_adjustment_cents=liquidity, economic_alpha_cents=alpha, strategic_score_cents=alpha + liquidity, dealer_ask_median_cents=_cents(payload.dealerAskMedian), private_ask_median_cents=_cents(payload.privateAskMedian), clearing_estimate_cents=_cents(payload.clearingEstimate), qlv_haircut_bps=payload.qlvHaircutBps))
    session.commit()
    return {"id": listing.id, "economicAlpha": alpha / 100, "strategicScore": (alpha + liquidity) / 100, "confidence": confidence}
