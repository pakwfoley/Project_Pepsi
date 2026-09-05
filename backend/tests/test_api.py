from fastapi.testclient import TestClient

from project_pepsi.app import app, settings
from project_pepsi.auth import Principal, authenticate


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
