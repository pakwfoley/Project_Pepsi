from dataclasses import asdict, dataclass

from .contracts import WatchAnalysis


@dataclass(frozen=True)
class ReviewPriority:
    score: int
    posture: str
    risk_level: str
    valuation_status: str
    factors: list[str]

    def as_dict(self) -> dict:
        return asdict(self)


def calculate_review_priority(
    analysis: WatchAnalysis,
    image_count: int,
    distance_miles: float | None,
) -> ReviewPriority:
    """Rank review urgency from evidence only; never infer financial upside."""
    if not analysis.relevant or analysis.recommendation == "skip":
        return ReviewPriority(0, "pass", "high", "valuation_required", ["Model recommends skipping this listing"])

    recommendation_points = 35 if analysis.recommendation == "investigate" else 20
    confidence_points = round(analysis.identification.confidence * 0.35)
    coverage_points = min(max(image_count, 0), 6) * 3
    location_points = 7 if distance_miles is not None and distance_miles <= 100 else 3 if distance_miles is not None else 0
    risk_penalty = min(30, len(analysis.riskSignals) * 4 + len(analysis.missingInformation) * 2)
    score = max(0, min(100, recommendation_points + confidence_points + coverage_points + location_points - risk_penalty))

    risk_level = "high" if len(analysis.riskSignals) >= 5 else "moderate" if len(analysis.riskSignals) >= 3 or len(analysis.missingInformation) >= 4 else "low"
    posture = "qualify" if analysis.recommendation == "investigate" else "monitor"
    factors = [
        f"Identification confidence +{confidence_points}",
        f"Photo coverage +{coverage_points}",
        f"Location evidence +{location_points}",
        f"Risk and missing evidence -{risk_penalty}",
    ]
    return ReviewPriority(score, posture, risk_level, "valuation_required", factors)
