"""add issuer history

issuers: one row per issuer per tenant, keyed by RC number.
issuer_periods: confirmed figures for each financial year or half-year of an
issuer, saved when an assessment completes and reused by later assessments of
the same issuer on the same tenant. History is never shared across tenants.
assessments.rc_number and assessments.history: the issuer and the history
analysis saved with each result.
tenants.history_mode: off (default, feature hidden) or shadow (history shown,
adjustment calculated but not applied to the score).
RLS is enabled on the new tables to match 0002_enable_rls.

Revision ID: 0005_issuer_history
Revises: 0004_email_allowlist
Create Date: 2026-11-12

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005_issuer_history"
down_revision: str | None = "0004_email_allowlist"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "issuers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("rc_number", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "rc_number", name="uq_issuer_tenant_rc"),
    )
    op.create_table(
        "issuer_periods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("issuer_id", sa.Integer(), sa.ForeignKey("issuers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("period_months", sa.Integer(), nullable=False),
        sa.Column("audited", sa.Boolean(), nullable=True),
        sa.Column("basis", sa.Text(), nullable=True),
        sa.Column("figures", postgresql.JSONB(), nullable=False),
        sa.Column("doc_period_end", sa.Date(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("one_off", postgresql.JSONB(), nullable=True),
        sa.Column("previous_figures", postgresql.JSONB(), nullable=True),
        sa.Column("assessment_id", sa.Integer(), sa.ForeignKey("assessments.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("issuer_id", "period_end", "period_months", name="uq_issuer_period"),
    )
    op.execute("ALTER TABLE issuers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE issuer_periods ENABLE ROW LEVEL SECURITY")
    op.add_column("assessments", sa.Column("rc_number", sa.Text(), nullable=True))
    op.add_column("assessments", sa.Column("history", postgresql.JSONB(), nullable=True))
    op.add_column("tenants", sa.Column("history_mode", sa.Text(), server_default="off", nullable=False))


def downgrade() -> None:
    op.drop_column("tenants", "history_mode")
    op.drop_column("assessments", "history")
    op.drop_column("assessments", "rc_number")
    op.drop_table("issuer_periods")
    op.drop_table("issuers")
