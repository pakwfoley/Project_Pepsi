import logging
import time
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .auth import Principal, require_scope
from .contracts import ManualListingInput, NormalizeInput, TradeEconomicsInput, WatchAnalysis, insufficient_valuation, parse_listing_submission
from .database import Listing, ScannerCandidate, Valuation, get_session
from .economics import calculate_trade_economics
from .normalization import normalize_listing
from .openai_client import OpenAIConfigurationError, OpenAIResponseError, analyze_listing, enrich_with_market_comps
from .opportunity import calculate_review_priority
from .repository import save_analysis
from .services import create_manual_listing

settings = get_settings()
logger = logging.getLogger("project_pepsi")
app = FastAPI(title="Project Pepsi API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_origin_regex=r"chrome-extension://.*", allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["authorization", "content-type"])


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
async def analyze(payload: dict, principal: Principal = Depends(require_scope("analyze:listings")), session: Session = Depends(get_session)) -> dict:
    try:
        listing, rejected_indexes = parse_listing_submission(payload)
        analysis, metadata = await analyze_listing(listing, settings)
        analysis, comp_metadata = await enrich_with_market_comps(listing, analysis, settings)
        metadata.update(comp_metadata)
        persisted_metadata = {"model": metadata["model"], "responseId": metadata["response_id"], "latencyMs": metadata["latency_ms"], "usage": metadata["usage"], "usableImageCount": len(listing.images), "rejectedImageIndexes": rejected_indexes, "compStatus": metadata.get("comp_status"), "compResponseId": metadata.get("comp_response_id"), "compLatencyMs": metadata.get("comp_latency_ms"), "compQueries": metadata.get("comp_queries", []), "compUsage": metadata.get("comp_usage", {})}
        candidate = save_analysis(session, principal.user_id, listing, analysis, persisted_metadata)
        logger.info("analysis_complete candidate_id=%s model=%s latency_ms=%s usable_images=%s rejected_images=%s input_tokens=%s output_tokens=%s", candidate.id, metadata["model"], metadata["latency_ms"], len(listing.images), len(rejected_indexes), metadata["usage"].get("input_tokens"), metadata["usage"].get("output_tokens"))
        return {"ok": True, "candidateId": candidate.id, "analysis": analysis, "model": metadata["model"], "responseId": metadata["response_id"], "telemetry": persisted_metadata, "ingestion": {"contractVersion": 1, "submittedImages": candidate.image_metadata, "rejectedImageIndexes": rejected_indexes}}
    except OpenAIConfigurationError as exc:
        raise HTTPException(status_code=503, detail={"code": str(exc), "error": "OpenAI connectivity is not configured."}) from exc
    except OpenAIResponseError as exc:
        raise HTTPException(status_code=502, detail={"code": str(exc).split(":")[0], "error": "OpenAI analysis failed."}) from exc


@app.get("/api/analyze")
def candidates(principal: Principal = Depends(require_scope("read:listings")), session: Session = Depends(get_session)) -> dict:
    rows = session.scalars(select(ScannerCandidate).where(ScannerCandidate.owner_id == principal.user_id).order_by(ScannerCandidate.updated_at.desc()).limit(30)).all()
    candidates_with_priority = []
    for row in rows:
        stored_analysis = row.analysis if "valuation" in row.analysis else {**row.analysis, "valuation": insufficient_valuation().model_dump(mode="json")}
        analysis = WatchAnalysis.model_validate(stored_analysis)
        priority = calculate_review_priority(analysis, len(row.image_metadata or []), row.distance_miles)
        priority_result = priority.as_dict()
        priority_result["valuation_status"] = "available" if analysis.valuation.valuationStatus == "estimated" else analysis.valuation.valuationStatus
        candidates_with_priority.append({"id": row.id, "sourceKey": row.source_listing_id, "url": row.url, "title": row.title, "rawText": row.description, "askCents": row.asking_price_cents, "locationText": row.location_text, "distanceMiles": row.distance_miles, "imageMetadata": row.image_metadata, "analysis": analysis.model_dump(mode="json"), "analysisMetadata": row.analysis_metadata, "reviewPriority": priority_result, "status": row.status, "createdAt": row.created_at, "updatedAt": row.updated_at})
    candidates_with_priority.sort(key=lambda item: item["reviewPriority"]["score"], reverse=True)
    return {"candidates": candidates_with_priority}


@app.post("/api/economics")
def economics(payload: TradeEconomicsInput, _principal: Principal = Depends(require_scope("analyze:listings"))) -> dict:
    return calculate_trade_economics(payload).__dict__


@app.post("/api/normalize")
def normalize(payload: NormalizeInput, _principal: Principal = Depends(require_scope("analyze:listings"))) -> dict:
    return normalize_listing(str(payload.url or ""), payload.text)


@app.get("/api/listings")
def listings(principal: Principal = Depends(require_scope("read:listings")), session: Session = Depends(get_session)) -> dict:
    rows = session.execute(select(Listing, Valuation).join(Valuation, Valuation.listing_id == Listing.id).where(Listing.owner_id == principal.user_id).order_by(Listing.created_at.desc()).limit(8)).all()
    return {"listings": [{"id": listing.id, "url": listing.url, "source": listing.source, "brand": listing.brand, "model": listing.model, "reference": listing.reference, "askCents": listing.ask_cents, "confidence": listing.normalization_confidence, "createdAt": listing.created_at, "economicAlphaCents": valuation.economic_alpha_cents, "strategicScoreCents": valuation.strategic_score_cents} for listing, valuation in rows]}


@app.post("/api/listings", status_code=201)
def create_listing(payload: ManualListingInput, principal: Principal = Depends(require_scope("write:listings")), session: Session = Depends(get_session)) -> dict:
    return create_manual_listing(session, principal.user_id, payload)
