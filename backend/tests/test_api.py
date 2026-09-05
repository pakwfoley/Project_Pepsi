from fastapi.testclient import TestClient

from project_pepsi.app import app, settings


client = TestClient(app)
settings.project_pepsi_api_token = "test-service-token"
AUTH = {"authorization": "Bearer test-service-token"}


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_analyze_fails_clearly_when_openai_key_is_missing():
    response = client.post(
        "/api/analyze",
        headers=AUTH,
        json={
            "url": "https://www.facebook.com/marketplace/item/1",
            "title": "Watch",
            "images": [],
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "OPENAI_API_KEY_MISSING"


def test_api_rejects_missing_service_token():
    response = client.post("/api/economics", json={"received_qlv": 1, "given_qlv": 0, "cash_added": 0, "transaction_cost": 0, "risk_penalty": 0, "transaction_friction": 0})
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "UNAUTHORIZED"
