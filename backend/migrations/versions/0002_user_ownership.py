"""Associate persisted resources with their authenticated owner.

Revision ID: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("scanner_candidates", sa.Column("owner_id", sa.String(255), nullable=False, server_default="__legacy_unowned__"))
    op.add_column("listings", sa.Column("owner_id", sa.String(255), nullable=False, server_default="__legacy_unowned__"))
    op.alter_column("scanner_candidates", "owner_id", server_default=None)
    op.alter_column("listings", "owner_id", server_default=None)
    op.create_index("ix_scanner_candidates_owner_id", "scanner_candidates", ["owner_id"])
    op.create_index("ix_listings_owner_id", "listings", ["owner_id"])


def downgrade():
    op.drop_index("ix_listings_owner_id", table_name="listings")
    op.drop_index("ix_scanner_candidates_owner_id", table_name="scanner_candidates")
    op.drop_column("listings", "owner_id")
    op.drop_column("scanner_candidates", "owner_id")
