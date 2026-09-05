from fastapi.testclient import TestClient

from project_pepsi.app import app


client = TestClient(app)


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
