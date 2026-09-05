from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from project_pepsi.app import app
from project_pepsi.auth import Principal, authenticate
from project_pepsi.database import Base, Listing, Valuation, get_session
from fastapi.testclient import TestClient


def valuation(listing_id: str) -> Valuation:
    return Valuation(listing_id=listing_id, received_qlv_cents=1, given_qlv_cents=0, cash_paid_cents=0, cost_cents=0, expected_risk_loss_cents=0, liquidity_adjustment_cents=0, economic_alpha_cents=1, strategic_score_cents=1, dealer_ask_median_cents=0, private_ask_median_cents=0, clearing_estimate_cents=0, qlv_haircut_bps=0)


def test_listing_queries_are_scoped_to_authenticated_owner():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        own = Listing(owner_id="auth0|one", url="https://example.test/one", source="manual", brand="Omega", model="One", reference="1", ask_cents=1, normalization_confidence=1)
        other = Listing(owner_id="auth0|two", url="https://example.test/two", source="manual", brand="Rolex", model="Two", reference="2", ask_cents=2, normalization_confidence=1)
        session.add_all([own, other]); session.flush(); session.add_all([valuation(own.id), valuation(other.id)]); session.commit()

    def session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[authenticate] = lambda: Principal("auth0|one", frozenset({"read:listings"}))
    try:
        response = TestClient(app).get("/api/listings")
    finally:
        app.dependency_overrides.pop(get_session, None)
    assert response.status_code == 200
    assert [item["brand"] for item in response.json()["listings"]] == ["Omega"]
