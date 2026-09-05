"""Create scanner candidates.

Revision ID: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("scanner_candidates", sa.Column("id", sa.String(36), primary_key=True), sa.Column("source", sa.String(40), nullable=False), sa.Column("source_listing_id", sa.String(255), nullable=False), sa.Column("url", sa.Text(), nullable=False), sa.Column("title", sa.String(500), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("asking_price_cents", sa.Integer()), sa.Column("currency", sa.String(3), nullable=False), sa.Column("location_text", sa.String(200), nullable=False), sa.Column("distance_miles", sa.Float()), sa.Column("raw_payload", sa.JSON(), nullable=False), sa.Column("image_metadata", sa.JSON(), nullable=False), sa.Column("analysis", sa.JSON(), nullable=False), sa.Column("status", sa.String(30), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("source", "source_listing_id", name="uq_scanner_source_listing"))
    op.create_index("idx_scanner_candidates_status_updated", "scanner_candidates", ["status", "updated_at"])
    op.create_table("listings", sa.Column("id", sa.String(36), primary_key=True), sa.Column("url", sa.Text(), nullable=False), sa.Column("source", sa.String(40), nullable=False), sa.Column("raw_text", sa.Text(), nullable=False), sa.Column("brand", sa.String(100), nullable=False), sa.Column("model", sa.String(200), nullable=False), sa.Column("reference", sa.String(100), nullable=False), sa.Column("ask_cents", sa.Integer(), nullable=False), sa.Column("normalization_confidence", sa.Float(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("valuations", sa.Column("id", sa.String(36), primary_key=True), sa.Column("listing_id", sa.String(36), nullable=False), sa.Column("policy_version", sa.String(30), nullable=False), sa.Column("received_qlv_cents", sa.Integer(), nullable=False), sa.Column("given_qlv_cents", sa.Integer(), nullable=False), sa.Column("cash_paid_cents", sa.Integer(), nullable=False), sa.Column("cost_cents", sa.Integer(), nullable=False), sa.Column("expected_risk_loss_cents", sa.Integer(), nullable=False), sa.Column("liquidity_adjustment_cents", sa.Integer(), nullable=False), sa.Column("economic_alpha_cents", sa.Integer(), nullable=False), sa.Column("strategic_score_cents", sa.Integer(), nullable=False), sa.Column("dealer_ask_median_cents", sa.Integer(), nullable=False), sa.Column("private_ask_median_cents", sa.Integer(), nullable=False), sa.Column("clearing_estimate_cents", sa.Integer(), nullable=False), sa.Column("qlv_haircut_bps", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("listing_id"))
    op.create_index("ix_valuations_listing_id", "valuations", ["listing_id"], unique=True)


def downgrade():
    op.drop_index("ix_valuations_listing_id", table_name="valuations")
    op.drop_table("valuations")
    op.drop_table("listings")
    op.drop_index("idx_scanner_candidates_status_updated", table_name="scanner_candidates")
    op.drop_table("scanner_candidates")
