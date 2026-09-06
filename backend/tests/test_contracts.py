import base64
from io import BytesIO

import pytest
from PIL import Image
from pydantic import ValidationError

from project_pepsi.contracts import CapturedImage, ListingIngest, ValuationRange, ValuationResult, parse_listing_submission


def image(index: int = 0) -> dict:
    buffer = BytesIO()
    Image.new("RGB", (2, 1), "white").save(buffer, format="WEBP", quality=88)
    raw = buffer.getvalue()
    return {"contractVersion": 1, "imageIndex": index, "sourceUrl": "https://example.test/image", "sourceType": "test", "mediaType": "image/webp", "originalWidth": 3000, "originalHeight": 1500, "width": 2, "height": 1, "longEdge": 2, "quality": .88, "byteLength": len(raw), "dataUrl": "data:image/webp;base64," + base64.b64encode(raw).decode()}


def test_accepts_six_images():
    listing = ListingIngest(url="https://www.facebook.com/marketplace/item/1", title="Watch", images=[image(i) for i in range(6)])
    assert len(listing.images) == 6


def test_rejects_oversized_or_seventh_image():
    with pytest.raises(ValidationError): CapturedImage.model_validate({**image(), "width": 2049, "longEdge": 2049})
    with pytest.raises(ValidationError): ListingIngest(url="https://www.facebook.com/marketplace/item/1", title="Watch", images=[image(i) for i in range(7)])


def test_bad_image_is_rejected_without_losing_good_images():
    listing, rejected = parse_listing_submission({"url": "https://www.facebook.com/marketplace/item/1", "title": "Watch", "images": [image(0), {**image(1), "width": 4096}]})
    assert [item.imageIndex for item in listing.images] == [0]
    assert rejected == [1]


def test_listing_contract_rejects_extension_internal_fields():
    with pytest.raises(ValidationError):
        ListingIngest.model_validate({"url": "https://www.facebook.com/marketplace/item/1", "title": "Watch", "score": 80})


def test_listing_contract_preserves_source_identity():
    listing = ListingIngest.model_validate({"contractVersion": 1, "source": "facebook_marketplace", "sourceListingId": "123", "url": "https://www.facebook.com/marketplace/item/123", "title": "Watch"})
    assert listing.sourceListingId == "123"


def test_structured_provisional_valuation_parses():
    valuation = ValuationResult(valuationStatus="estimated", valuationMethod="ai_provisional_v1", currency="USD", fairMarketValue={"estimate": 950, "low": 750, "high": 1200}, quickLiquidationValue={"estimate": 775, "low": 650, "high": 900}, tradeValue={"estimate": 900, "low": 750, "high": 1050}, confidence=72, liquidity="moderate", basis=["Likely reference identified"], uncertainties=["Service history unverified"])
    assert valuation.valuationMethod == "ai_provisional_v1"
    assert valuation.quickLiquidationValue.estimate == 775


def test_invalid_valuation_range_and_confidence_are_rejected():
    with pytest.raises(ValidationError):
        ValuationRange(estimate=700, low=800, high=1000)
    with pytest.raises(ValidationError):
        ValuationResult(valuationStatus="insufficient_evidence", valuationMethod="ai_provisional_v1", currency="USD", fairMarketValue=None, quickLiquidationValue=None, tradeValue=None, confidence=101, liquidity="unknown", basis=[], uncertainties=[])


def test_unknown_valuation_is_not_zero_value():
    valuation = ValuationResult(valuationStatus="insufficient_evidence", valuationMethod="ai_provisional_v1", currency="USD", fairMarketValue=None, quickLiquidationValue=None, tradeValue=None, confidence=10, liquidity="unknown", basis=[], uncertainties=["Reference unknown"])
    assert valuation.fairMarketValue is None
    assert valuation.quickLiquidationValue is None
    assert valuation.tradeValue is None


def test_estimated_valuation_requires_complete_economics_basis_and_liquidity():
    common = {"valuationStatus": "estimated", "valuationMethod": "ai_provisional_v1", "currency": "USD", "fairMarketValue": {"estimate": 950, "low": 750, "high": 1200}, "quickLiquidationValue": {"estimate": 775, "low": 650, "high": 900}, "tradeValue": {"estimate": 900, "low": 750, "high": 1050}, "confidence": 45, "liquidity": "moderate", "basis": ["Model-family fallback"], "uncertainties": ["Exact reference unknown"]}
    assert ValuationResult.model_validate(common).valuationStatus == "estimated"
    with pytest.raises(ValidationError):
        ValuationResult.model_validate({**common, "quickLiquidationValue": None})
    with pytest.raises(ValidationError):
        ValuationResult.model_validate({**common, "basis": []})
    with pytest.raises(ValidationError):
        ValuationResult.model_validate({**common, "liquidity": "unknown"})


def test_legacy_available_status_reads_as_estimated():
    valuation = ValuationResult(valuationStatus="available", valuationMethod="ai_provisional_v1", currency="USD", fairMarketValue={"estimate": 950, "low": 750, "high": 1200}, quickLiquidationValue={"estimate": 775, "low": 650, "high": 900}, tradeValue={"estimate": 900, "low": 750, "high": 1050}, confidence=72, liquidity="moderate", basis=["Likely reference identified"], uncertainties=[])
    assert valuation.valuationStatus == "estimated"


def test_model_valuation_cannot_authorize_transaction():
    with pytest.raises(ValidationError):
        ValuationResult.model_validate({"valuationStatus": "insufficient_evidence", "valuationMethod": "ai_provisional_v1", "currency": "USD", "fairMarketValue": None, "quickLiquidationValue": None, "tradeValue": None, "confidence": 0, "liquidity": "unknown", "basis": [], "uncertainties": [], "purchaseAuthorized": True})
