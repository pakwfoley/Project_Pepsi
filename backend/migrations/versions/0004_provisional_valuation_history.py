"""Add immutable scanner analysis history and owner-scoped identity.

Revision ID: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("uq_scanner_source_listing", "scanner_candidates", type_="unique")
    op.create_unique_constraint("uq_scanner_owner_source_listing", "scanner_candidates", ["owner_id", "source", "source_listing_id"])
    op.create_table(
        "scanner_analysis_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("candidate_id", sa.String(36), nullable=False),
        sa.Column("owner_id", sa.String(255), nullable=False),
        sa.Column("analysis", sa.JSON(), nullable=False),
        sa.Column("valuation", sa.JSON(), nullable=False),
        sa.Column("valuation_method", sa.String(40), nullable=False),
        sa.Column("analysis_metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_scanner_analysis_runs_candidate_id", "scanner_analysis_runs", ["candidate_id"])
    op.create_index("ix_scanner_analysis_runs_owner_id", "scanner_analysis_runs", ["owner_id"])


def downgrade():
    op.drop_index("ix_scanner_analysis_runs_owner_id", table_name="scanner_analysis_runs")
    op.drop_index("ix_scanner_analysis_runs_candidate_id", table_name="scanner_analysis_runs")
    op.drop_table("scanner_analysis_runs")
    op.drop_constraint("uq_scanner_owner_source_listing", "scanner_candidates", type_="unique")
    op.create_unique_constraint("uq_scanner_source_listing", "scanner_candidates", ["source", "source_listing_id"])
