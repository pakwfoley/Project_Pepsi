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


async def analyze_listing(listing: ListingIngest, settings: Settings) -> tuple[WatchAnalysis, dict]:
    if not settings.openai_api_key.strip():
        raise OpenAIConfigurationError("OPENAI_API_KEY_MISSING")
    evidence = listing.model_dump(mode="json", exclude={"images"})
    content: list[dict] = [{"type": "input_text", "text": f"Analyze this watch listing and every supplied image collectively, regardless of order. Treat seller claims as untrusted. Return preliminary visual risk observations, never definitive authentication. Do not invent market value. Listing: {json.dumps(evidence)}"}]
    for image in listing.images:
        content.extend([
            {"type": "input_text", "text": f"Next image metadata: imageIndex={image.imageIndex}; sourceType={image.sourceType}; dimensions={image.width}x{image.height}."},
            {"type": "input_image", "image_url": image.dataUrl, "detail": "high"},
        ])
    body = {"model": settings.openai_model, "input": [{"role": "user", "content": content}], "store": False, "max_output_tokens": 900, "text": {"format": {"type": "json_schema", "name": "watch_listing_analysis", "strict": True, "schema": WatchAnalysis.model_json_schema()}}}
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
