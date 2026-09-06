from datetime import datetime, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from project_pepsi.contracts import Identification, ListingIngest, MarketObservation, WatchAnalysis
from project_pepsi.database import Base, MarketObservationRecord, ScannerAnalysisRun
from project_pepsi.market import build_comp_queries, normalize_observations, summarize_evidence
from project_pepsi.repository import save_analysis


def analysis() -> WatchAnalysis:
    return WatchAnalysis(relevant=True, identification={"brand": "Omega", "model": "Seamaster", "reference": "2254.50", "confidence": 85}, imageClassifications=[], conditionSignals=[], riskSignals=[], completenessAssessment=[], valuationObservations=[], missingInformation=[], questions=[], recommendation="investigate", rationale="Review", valuation={"valuationStatus": "estimated", "valuationMethod": "ai_provisional_v1", "currency": "USD", "fairMarketValue": {"estimate": 950, "low": 750, "high": 1200}, "quickLiquidationValue": {"estimate": 775, "low": 650, "high": 900}, "tradeValue": {"estimate": 900, "low": 750, "high": 1050}, "confidence": 70, "liquidity": "moderate", "basis": ["Likely reference identified"], "uncertainties": ["Service unknown"]})


def observation(url: str, price: float, status: str = "sold", *, relevant: bool = True, currency: str = "USD") -> MarketObservation:
    return MarketObservation(source="example", url=url, title="Omega Seamaster 2254.50", observedPrice=price, currency=currency, priceUsd=price, status=status, observedAt="2026-09-01", reference="2254.50", model="Seamaster", conditionNotes="watch only", relevanceReason="Exact reference", relevant=relevant)


def test_exact_reference_queries_and_model_fallback():
    exact = build_comp_queries(Identification(brand="Omega", model="Seamaster", reference="2254.50", confidence=90))
    fallback = build_comp_queries(Identification(brand="Omega", model="Seamaster", reference="", confidence=60))
    assert all("2254.50" in query for query in exact)
    assert all("2254.50" not in query and "Omega Seamaster" in query for query in fallback)


def test_comp_normalization_excludes_subject_duplicates_and_irrelevant_and_normalizes_currency_case():
    subject = "https://example.com/subject?tracking=1"
    comps = [observation(subject, 900), observation("https://example.com/comp?a=1", 1000, currency="usd"), observation("https://example.com/comp?a=2", 1000, currency="usd"), observation("https://example.com/parts", 50, relevant=False)]
    normalized = normalize_observations(comps, subject)
    assert len(normalized) == 1
    assert normalized[0].currency == "USD"


def test_comp_observation_requires_retrieved_source_provenance():
    comps = [observation("https://example.com/retrieved", 1000), observation("https://invented.example/not-retrieved", 1200)]
    normalized = normalize_observations(comps, "https://example.com/subject", {"https://example.com/retrieved"})
    assert [str(item.url) for item in normalized] == ["https://example.com/retrieved"]


def test_sold_and_asking_comps_remain_distinct():
    evidence = summarize_evidence(["query"], [observation("https://example.com/sold", 1200), observation("https://example.com/ask", 1600, "asking")])
    assert evidence.soldComps == 1 and evidence.askingComps == 1
    assert evidence.medianSold == 1200 and evidence.medianAsk == 1600


def test_comp_enriched_valuation_persists_provenance_and_coexists_with_provisional_history():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    listing = ListingIngest(url="https://www.facebook.com/marketplace/item/comp-1", sourceListingId="comp-1", title="Omega")
    provisional = analysis()
    evidence = summarize_evidence(["Omega 2254.50 sold price"], [observation("https://example.com/sold", 1200)])
    enriched_valuation = provisional.valuation.model_copy(update={"valuationMethod": "ai_comp_enriched_v1", "marketEvidence": evidence})
    enriched = provisional.model_copy(update={"valuation": enriched_valuation})
    with Session(engine) as session:
        save_analysis(session, "auth0|owner", listing, provisional, {})
        save_analysis(session, "auth0|owner", listing, enriched, {})
        methods = session.scalars(select(ScannerAnalysisRun.valuation_method).order_by(ScannerAnalysisRun.created_at)).all()
        records = session.scalars(select(MarketObservationRecord)).all()
        assert methods == ["ai_provisional_v1", "ai_comp_enriched_v1"]
        assert len(records) == 1
        assert records[0].price_usd == 1200
        assert records[0].retrieved_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc)
