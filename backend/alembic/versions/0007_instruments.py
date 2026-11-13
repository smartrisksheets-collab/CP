"""add instrument choice (bonds, loans, general reviews)

tenants.instrument_mode: off (default; every assessment is commercial paper as before)
or on (the analyst picks commercial paper, a bond or note, a loan or facility, or a
general review). assessments.instrument: the code used; NULL means commercial paper.

Revision ID: 0007_instruments
Revises: 0006_fi_peers
Create Date: 2026-11-13

"""
from alembic import op
import sqlalchemy as sa

revision: str = "0007_instruments"
down_revision: str | None = "0006_fi_peers"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("assessments", sa.Column("instrument", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("instrument_mode", sa.Text(), server_default="off", nullable=False))


def downgrade() -> None:
    op.drop_column("tenants", "instrument_mode")
    op.drop_column("assessments", "instrument")
