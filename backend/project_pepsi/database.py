from collections.abc import Generator
from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


class ScannerCandidate(Base):
    __tablename__ = "scanner_candidates"
    __table_args__ = (UniqueConstraint("source", "source_listing_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(String(255), index=True)
    source: Mapped[str] = mapped_column(String(40), default="facebook_marketplace")
    source_listing_id: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text, default="")
    asking_price_cents: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    location_text: Mapped[str] = mapped_column(String(200), default="")
    distance_miles: Mapped[float | None] = mapped_column(Float)
    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    image_metadata: Mapped[list] = mapped_column(JSON, default=list)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    analysis_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(String(255), index=True)
    url: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40))
    raw_text: Mapped[str] = mapped_column(Text, default="")
    brand: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(200))
    reference: Mapped[str] = mapped_column(String(100))
    ask_cents: Mapped[int] = mapped_column(Integer)
    normalization_confidence: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Valuation(Base):
    __tablename__ = "valuations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    listing_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    policy_version: Mapped[str] = mapped_column(String(30), default="mvp-2")
    received_qlv_cents: Mapped[int] = mapped_column(Integer)
    given_qlv_cents: Mapped[int] = mapped_column(Integer)
    cash_paid_cents: Mapped[int] = mapped_column(Integer)
    cost_cents: Mapped[int] = mapped_column(Integer)
    expected_risk_loss_cents: Mapped[int] = mapped_column(Integer)
    liquidity_adjustment_cents: Mapped[int] = mapped_column(Integer)
    economic_alpha_cents: Mapped[int] = mapped_column(Integer)
    strategic_score_cents: Mapped[int] = mapped_column(Integer)
    dealer_ask_median_cents: Mapped[int] = mapped_column(Integer)
    private_ask_median_cents: Mapped[int] = mapped_column(Integer)
    clearing_estimate_cents: Mapped[int] = mapped_column(Integer)
    qlv_haircut_bps: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
