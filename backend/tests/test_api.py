from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from project_pepsi.app import app, settings
from project_pepsi.auth import Principal, authenticate
from project_pepsi.database import Base, ScannerCandidate, get_session


client = TestClient(app)
app.dependency_overrides[authenticate] = lambda: Principal("auth0|test-user", frozenset({"read:listings", "write:listings", "analyze:listings"}))


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_analyze_fails_clearly_when_openai_key_is_missing():
    response = client.post(
        "/api/analyze",
        json={
            "url": "https://www.facebook.com/marketplace/item/1",
            "title": "Watch",
            "images": [],
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "OPENAI_API_KEY_MISSING"


def test_api_rejects_missing_access_token():
    override = app.dependency_overrides.pop(authenticate)
    settings.oidc_issuer = "https://issuer.example/"
    settings.oidc_audience = "https://api.project-pepsi"
    try:
        response = client.post("/api/economics", json={"received_qlv": 1, "given_qlv": 0, "cash_added": 0, "transaction_cost": 0, "risk_penalty": 0, "transaction_friction": 0})
    finally:
        app.dependency_overrides[authenticate] = override
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "UNAUTHORIZED"


def test_api_rejects_missing_scope():
    override = app.dependency_overrides[authenticate]
    app.dependency_overrides[authenticate] = lambda: Principal("auth0|test-user", frozenset())
    try:
        response = client.post("/api/economics", json={"received_qlv": 1, "given_qlv": 0, "cash_added": 0, "transaction_cost": 0, "risk_penalty": 0, "transaction_friction": 0})
    finally:
        app.dependency_overrides[authenticate] = override
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "INSUFFICIENT_SCOPE"


def test_candidate_queue_returns_review_priority():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db_session = Session(engine)
    candidate = ScannerCandidate(
        owner_id="auth0|test-user",
        source="facebook_marketplace",
        source_listing_id="ranked-1",
        url="https://www.facebook.com/marketplace/item/ranked-1/",
        title="Omega Seamaster",
        description="Watch listing",
        raw_payload={},
        image_metadata=[],
        analysis_metadata={"model": "test-model", "latencyMs": 1250, "usage": {"total_tokens": 321}, "usableImageCount": 0, "rejectedImageIndexes": [1]},
        analysis={
            "relevant": True,
            "identification": {"brand": "Omega", "model": "Seamaster", "reference": "", "confidence": 80},
            "imageClassifications": [],
            "conditionSignals": [],
            "riskSignals": [],
            "completenessAssessment": [],
            "valuationObservations": [],
            "missingInformation": [],
            "questions": [],
            "recommendation": "investigate",
            "rationale": "Review this listing.",
        },
    )
    db_session.add(candidate)
    db_session.commit()
    app.dependency_overrides[get_session] = lambda: db_session
    try:
        response = client.get("/api/analyze")
    finally:
        app.dependency_overrides.pop(get_session, None)
        db_session.close()
    assert response.status_code == 200
    assert response.json()["candidates"][0]["reviewPriority"]["valuation_status"] == "insufficient_evidence"
    assert response.json()["candidates"][0]["analysisMetadata"]["latencyMs"] == 1250
    assert response.json()["candidates"][0]["analysisMetadata"]["usage"]["total_tokens"] == 321
