"""Persist analysis telemetry for P2 validation.

Revision ID: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("scanner_candidates", sa.Column("analysis_metadata", sa.JSON(), nullable=False, server_default="{}"))
    op.alter_column("scanner_candidates", "analysis_metadata", server_default=None)


def downgrade():
    op.drop_column("scanner_candidates", "analysis_metadata")
