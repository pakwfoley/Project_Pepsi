"""Persist comp observations used by scanner valuation runs.

Revision ID: 0005
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "market_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("analysis_run_id", sa.String(36), nullable=False),
        sa.Column("candidate_id", sa.String(36), nullable=False),
        sa.Column("owner_id", sa.String(255), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("observed_price", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("price_usd", sa.Float(), nullable=False),
        sa.Column("sale_status", sa.String(20), nullable=False),
        sa.Column("observation", sa.JSON(), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_market_observations_analysis_run_id", "market_observations", ["analysis_run_id"])
    op.create_index("ix_market_observations_candidate_id", "market_observations", ["candidate_id"])
    op.create_index("ix_market_observations_owner_id", "market_observations", ["owner_id"])


def downgrade():
    op.drop_index("ix_market_observations_owner_id", table_name="market_observations")
    op.drop_index("ix_market_observations_candidate_id", table_name="market_observations")
    op.drop_index("ix_market_observations_analysis_run_id", table_name="market_observations")
    op.drop_table("market_observations")
