from sqlalchemy import create_engine, select
import pytest
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from project_pepsi.contracts import ListingIngest, WatchAnalysis
from project_pepsi.database import Base, ScannerAnalysisRun
from project_pepsi.openai_client import _analysis_instruction
from project_pepsi.repository import save_analysis


def analysis(estimate: int = 950) -> WatchAnalysis:
    return WatchAnalysis(
        relevant=True,
        identification={"brand": "Omega", "model": "Seamaster", "reference": "2254.50", "confidence": 85},
        imageClassifications=[], conditionSignals=[], riskSignals=[], completenessAssessment=[], valuationObservations=[], missingInformation=[], questions=[], recommendation="investigate", rationale="Review",
        valuation={"valuationStatus": "estimated", "valuationMethod": "ai_provisional_v1", "currency": "USD", "fairMarketValue": {"estimate": estimate, "low": 800, "high": 1100}, "quickLiquidationValue": {"estimate": 775, "low": 650, "high": 900}, "tradeValue": {"estimate": 900, "low": 750, "high": 1000}, "confidence": 70, "liquidity": "moderate", "basis": ["Identified reference"], "uncertainties": ["Service unknown"]},
    )


def test_prompt_treats_asking_price_as_context_not_fmv():
    prompt = _analysis_instruction({"price": 950})
    assert "context only" in prompt
    assert "MUST NOT be treated as evidence of fair market value" in prompt
    assert "general watch-market knowledge" in prompt
    assert "exact reference/configuration, then reference family, then model" in prompt
    assert "Missing caseback, movement, serial, papers, service history" in prompt
    assert "those omissions alone are not reasons to withhold" in prompt
    assert "Do not refuse valuation merely because live comparable-sales data is unavailable" in prompt
    assert "I will not estimate market value" in prompt
    assert "keep due-diligence recommendations separate from valuation" in prompt
    assert "purchase authorization" in prompt


@pytest.mark.parametrize("normal_uncertainty", ["movement", "papers", "service history", "reference", "authenticity"])
def test_normal_uncertainty_is_not_a_valuation_refusal(normal_uncertainty: str):
    prompt = _analysis_instruction({"missing": normal_uncertainty})
    assert normal_uncertainty in prompt
    assert "lower confidence, wider ranges, conservative QLV" in prompt


def test_prompt_reserves_insufficient_evidence_for_unusable_or_contradictory_input():
    prompt = _analysis_instruction({"title": "unknown"})
    assert "cannot be identified to a commercially meaningful watch family" in prompt
    assert "mixes multiple possible sale items" in prompt
    assert "evidence is so contradictory" in prompt


def test_persistence_keeps_immutable_versioned_runs_and_owner():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    listing = ListingIngest(url="https://www.facebook.com/marketplace/item/valuation-1", sourceListingId="valuation-1", title="Omega", price=1200)
    with Session(engine) as session:
        candidate = save_analysis(session, "auth0|owner", listing, analysis(), {"model": "test"})
        save_analysis(session, "auth0|owner", listing, analysis(975), {"model": "test-2"})
        runs = session.scalars(select(ScannerAnalysisRun).where(ScannerAnalysisRun.candidate_id == candidate.id).order_by(ScannerAnalysisRun.created_at)).all()
        assert len(runs) == 2
        assert {run.owner_id for run in runs} == {"auth0|owner"}
        assert [run.valuation["fairMarketValue"]["estimate"] for run in runs] == [950, 975]
        assert {run.valuation_method for run in runs} == {"ai_provisional_v1"}


def test_same_marketplace_listing_isolated_between_owners():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    listing = ListingIngest(url="https://www.facebook.com/marketplace/item/shared", sourceListingId="shared", title="Watch")
    with Session(engine) as session:
        first = save_analysis(session, "auth0|one", listing, analysis(), {})
        second = save_analysis(session, "auth0|two", listing, analysis(), {})
        assert first.id != second.id
        owners = session.scalars(select(ScannerAnalysisRun.owner_id)).all()
        assert sorted(owners) == ["auth0|one", "auth0|two"]
