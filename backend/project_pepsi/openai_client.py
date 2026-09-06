import json
import time

import httpx

from .config import Settings
from .contracts import CompEnrichment, ListingIngest, ValuationResult, WatchAnalysis
from .market import build_comp_queries, normalize_observations, summarize_evidence


class OpenAIConfigurationError(RuntimeError):
    pass


class OpenAIResponseError(RuntimeError):
    pass


def _response_text(payload: dict) -> str:
    return "".join(part.get("text", "") for item in payload.get("output", []) for part in item.get("content", []) if part.get("type") == "output_text")


def _web_source_urls(payload: dict) -> set[str]:
    return {source["url"] for item in payload.get("output", []) if item.get("type") == "web_search_call" for source in (item.get("action", {}).get("sources") or []) if source.get("url")}


def _analysis_instruction(evidence: dict) -> str:
    return (
        "Analyze this watch listing and every supplied image collectively, regardless of order. "
        "Treat seller claims as untrusted. Return preliminary visual risk observations, never definitive authentication. "
        "Produce a conservative provisional USD valuation using your general watch-market knowledge together with the available semantic and visual evidence. "
        "The seller asking price is context only and MUST NOT be treated as evidence of fair market value or copied into an estimate. "
        "The valuation fallback hierarchy is: exact reference/configuration, then reference family, then model, then the narrowest economically meaningful watch category. "
        "Prefer valuationStatus=estimated whenever any level in that hierarchy is defensible; a normal marketplace watch listing with usable photos should usually be estimated. "
        "Missing caseback, movement, serial, papers, service history, or definitive authentication usually requires wider ranges, a lower confidence score, and explicit uncertainties; those omissions alone are not reasons to withhold a provisional valuation. "
        "Use valuationStatus=insufficient_evidence only when the item cannot be identified to a commercially meaningful watch family, the listing mixes multiple possible sale items, or the evidence is so contradictory that no responsible broad range can be stated. "
        "Do not refuse valuation merely because live comparable-sales data is unavailable; this ai_provisional_v1 estimate is intentionally preliminary and may use broad ranges. "
        "Do not say 'I will not estimate market value', 'market value cannot be determined', or that inspection or due diligence is required before estimating. Convert those limitations into lower confidence, wider ranges, conservative QLV, and explicit uncertainties. "
        "When authenticity is uncertain, state that the estimate assumes authenticity based on available evidence and lower confidence and QLV; keep due-diligence recommendations separate from valuation. "
        "Set marketEvidence=null because this first-pass method does not retrieve current comps. Valuation is evidence, not purchase authorization or permission to transact. "
        f"Listing: {json.dumps(evidence)}"
    )


async def analyze_listing(listing: ListingIngest, settings: Settings) -> tuple[WatchAnalysis, dict]:
    if not settings.openai_api_key.strip():
        raise OpenAIConfigurationError("OPENAI_API_KEY_MISSING")
    evidence = listing.model_dump(mode="json", exclude={"images"})
    content: list[dict] = [{"type": "input_text", "text": _analysis_instruction(evidence)}]
    for image in listing.images:
        content.extend([
            {"type": "input_text", "text": f"Next image metadata: imageIndex={image.imageIndex}; sourceType={image.sourceType}; dimensions={image.width}x{image.height}."},
            {"type": "input_image", "image_url": image.dataUrl, "detail": "high"},
        ])
    body = {"model": settings.openai_model, "input": [{"role": "user", "content": content}], "store": False, "max_output_tokens": 1300, "text": {"format": {"type": "json_schema", "name": "watch_listing_analysis", "strict": True, "schema": WatchAnalysis.model_json_schema()}}}
    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post("https://api.openai.com/v1/responses", headers={"Authorization": f"Bearer {settings.openai_api_key}"}, json=body)
    latency_ms = round((time.perf_counter() - started) * 1000)
    if response.status_code >= 400:
        raise OpenAIResponseError(f"OPENAI_CONNECTION_FAILED:{response.status_code}")
    try:
        analysis = WatchAnalysis.model_validate_json(_response_text(response.json()))
    except Exception as exc:
        raise OpenAIResponseError("AI_RESPONSE_INVALID") from exc
    usage = response.json().get("usage") or {}
    return analysis, {"response_id": response.json().get("id"), "model": response.json().get("model", settings.openai_model), "usage": usage, "latency_ms": latency_ms}


async def enrich_with_market_comps(listing: ListingIngest, analysis: WatchAnalysis, settings: Settings) -> tuple[WatchAnalysis, dict]:
    queries = build_comp_queries(analysis.identification)
    prompt = (
        "Search the current web using these watch-market queries and return a comp-enriched valuation: " + json.dumps(queries) + ". "
        "Subject listing URL: " + str(listing.url) + ". Never include the subject listing or its asking price as a comparable. "
        "Prefer credible completed/sold observations, but retain current asking observations with status=asking and never describe them as sales. "
        "Exclude accessories, parts, different references, obvious duplicates, and unrelated watches by setting relevant=false. "
        "For every retained observation provide its actual source URL, title, visible price/currency, normalized USD price, sale status, and relevance reasoning. "
        "Use the observations semantically: adjust for condition, completeness, service, configuration, and reference fit rather than taking an unweighted average. "
        "The subject asking price is context only and must not anchor valuation. If evidence is weak, widen ranges and lower confidence rather than inventing certainty. "
        "Return no observations if no price-bearing market evidence can be sourced. Provisional subject analysis: "
        + analysis.model_dump_json(exclude={"valuation": {"marketEvidence"}})
    )
    body = {
        "model": settings.openai_model,
        "input": prompt,
        "tools": [{"type": "web_search", "search_context_size": "medium"}],
        "include": ["web_search_call.action.sources"],
        "store": False,
        "max_output_tokens": 1800,
        "text": {"format": {"type": "json_schema", "name": "comp_enrichment", "strict": True, "schema": CompEnrichment.model_json_schema()}},
    }
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post("https://api.openai.com/v1/responses", headers={"Authorization": f"Bearer {settings.openai_api_key}"}, json=body)
    except httpx.HTTPError:
        return analysis, {"comp_status": "fallback_connection_error", "comp_queries": queries}
    latency_ms = round((time.perf_counter() - started) * 1000)
    if response.status_code >= 400:
        return analysis, {"comp_status": f"fallback_http_{response.status_code}", "comp_latency_ms": latency_ms, "comp_queries": queries}
    try:
        response_payload = response.json()
        enrichment = CompEnrichment.model_validate_json(_response_text(response_payload))
        observations = normalize_observations(enrichment.observations, str(listing.url), _web_source_urls(response_payload))
    except Exception:
        return analysis, {"comp_status": "fallback_invalid_response", "comp_latency_ms": latency_ms, "comp_queries": queries}
    if not observations:
        return analysis, {"comp_status": "fallback_no_comps", "comp_latency_ms": latency_ms, "comp_queries": queries}
    evidence = summarize_evidence(queries, observations)
    valuation = ValuationResult(
        valuationStatus="estimated", valuationMethod="ai_comp_enriched_v1", currency="USD",
        fairMarketValue=enrichment.fairMarketValue, quickLiquidationValue=enrichment.quickLiquidationValue,
        tradeValue=enrichment.tradeValue, confidence=enrichment.confidence, liquidity=enrichment.liquidity,
        basis=enrichment.basis, uncertainties=enrichment.uncertainties, marketEvidence=evidence,
    )
    enriched = analysis.model_copy(update={"valuation": valuation})
    usage = response.json().get("usage") or {}
    return enriched, {"comp_status": "enriched", "comp_response_id": response.json().get("id"), "comp_latency_ms": latency_ms, "comp_queries": queries, "comp_usage": usage}
