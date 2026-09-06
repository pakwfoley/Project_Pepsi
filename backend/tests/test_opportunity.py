from project_pepsi.contracts import Identification, WatchAnalysis
from project_pepsi.opportunity import calculate_review_priority


def analysis(*, recommendation="investigate", confidence=80, risks=None, missing=None, relevant=True):
    return WatchAnalysis(
        relevant=relevant,
        identification=Identification(brand="Omega", model="Seamaster", reference="", confidence=confidence),
        imageClassifications=[],
        conditionSignals=[],
        riskSignals=risks or [],
        completenessAssessment=[],
        valuationObservations=[],
        valuation={"valuationStatus": "insufficient_evidence", "valuationMethod": "ai_provisional_v1", "currency": "USD", "fairMarketValue": None, "quickLiquidationValue": None, "tradeValue": None, "confidence": 0, "liquidity": "unknown", "basis": [], "uncertainties": ["Test fixture"]},
        missingInformation=missing or [],
        questions=[],
        recommendation=recommendation,
        rationale="Preliminary review only.",
    )


def test_review_priority_rewards_confidence_coverage_and_locality():
    strong = calculate_review_priority(analysis(confidence=90), image_count=6, distance_miles=25)
    weak = calculate_review_priority(analysis(confidence=45, risks=["risk"] * 3, missing=["missing"] * 4), image_count=1, distance_miles=None)
    assert strong.score > weak.score
    assert strong.valuation_status == "valuation_required"
    assert weak.risk_level == "moderate"


def test_skip_is_not_promoted_by_high_confidence_or_many_images():
    result = calculate_review_priority(analysis(recommendation="skip", confidence=100), image_count=6, distance_miles=1)
    assert result.score == 0
    assert result.posture == "pass"
