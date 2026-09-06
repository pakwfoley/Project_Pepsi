import json
import time

import httpx

from .config import Settings
from .contracts import ListingIngest, WatchAnalysis


class OpenAIConfigurationError(RuntimeError):
    pass


class OpenAIResponseError(RuntimeError):
    pass


def _response_text(payload: dict) -> str:
    return "".join(part.get("text", "") for item in payload.get("output", []) for part in item.get("content", []) if part.get("type") == "output_text")


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
        "Valuation is evidence, not purchase authorization or permission to transact. "
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
