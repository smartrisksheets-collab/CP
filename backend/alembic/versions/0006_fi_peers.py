"""add issuer sector, FI ratios and peer benchmarks

tenants.fi_mode: off (default, feature hidden) or shadow (sector field shown and FI
ratios calculated for financial issuers; never part of the score).
assessments.sector and assessments.fi: the sector chosen and the FI ratios with the
peer medians as they stood when the assessment ran, so old reports never change.
peer_benchmarks: peer medians by sector, ratio and financial year. Shown only once
verified. RLS is enabled to match 0002_enable_rls.

Revision ID: 0006_fi_peers
Revises: 0005_issuer_history
Create Date: 2026-11-12

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0006_fi_peers"
down_revision: str | None = "0005_issuer_history"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "peer_benchmarks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sector", sa.Text(), nullable=False),
        sa.Column("ratio_id", sa.Text(), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("peer_group", sa.Text(), nullable=False),
        sa.Column("median", sa.Float(), nullable=False),
        sa.Column("p25", sa.Float(), nullable=True),
        sa.Column("p75", sa.Float(), nullable=True),
        sa.Column("n", sa.Integer(), nullable=False),
        sa.Column("source_note", sa.Text(), nullable=True),
        sa.Column("company_values", postgresql.JSONB(), nullable=True),
        sa.Column("verified", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("sector", "ratio_id", "fiscal_year", "peer_group", name="uq_peer_benchmark"),
    )
    op.execute("ALTER TABLE peer_benchmarks ENABLE ROW LEVEL SECURITY")
    op.add_column("assessments", sa.Column("sector", sa.Text(), nullable=True))
    op.add_column("assessments", sa.Column("fi", postgresql.JSONB(), nullable=True))
    op.add_column("tenants", sa.Column("fi_mode", sa.Text(), server_default="off", nullable=False))


def downgrade() -> None:
    op.drop_column("tenants", "fi_mode")
    op.drop_column("assessments", "fi")
    op.drop_column("assessments", "sector")
    op.drop_table("peer_benchmarks")
