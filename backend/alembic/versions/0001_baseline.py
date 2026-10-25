"""baseline: schema as defined in api/models.py

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-25

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def _created_at() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("hostname", sa.Text(), nullable=False),
        sa.Column("client_name", sa.Text(), nullable=False),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("primary_color", sa.Text(), nullable=False),
        sa.Column("primary_hover", sa.Text(), nullable=False),
        sa.Column("accent_color", sa.Text(), nullable=False),
        sa.Column("accent_hover", sa.Text(), nullable=False),
        sa.Column("accent_rgb", sa.Text(), nullable=False),
        sa.Column("login_eyebrow", sa.Text(), nullable=True),
        sa.Column("login_subtext", sa.Text(), nullable=True),
        sa.Column("admin_email", sa.Text(), nullable=True),
        sa.Column("access_code", sa.Text(), nullable=True),
        sa.Column("allowed_emails", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("allowed_domains", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("session_ttl", sa.Integer(), nullable=False),
        _created_at(),
        sa.UniqueConstraint("hostname"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("company", sa.Text(), nullable=True),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("plan", sa.Text(), nullable=False),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column("credits_expire_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified", sa.Boolean(), nullable=False),
        sa.Column("onboarding_role", sa.Text(), nullable=True),
        sa.Column("onboarding_process", sa.Text(), nullable=True),
        sa.Column("onboarding_volume", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email", "tenant_id", name="uq_user_email_tenant"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "registrations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("company", sa.Text(), nullable=True),
        sa.Column("verification_token", sa.Text(), nullable=False),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("verification_token"),
    )
    op.create_index("ix_registrations_email", "registrations", ["email"])

    op.create_table(
        "otps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_otps_email", "otps", ["email"])

    op.create_table(
        "assessments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_email", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("client_name", sa.Text(), nullable=True),
        sa.Column("credit_rating", sa.Text(), nullable=True),
        sa.Column("total_score", sa.Integer(), nullable=True),
        sa.Column("max_score", sa.Integer(), nullable=False),
        sa.Column("eligible", sa.Boolean(), nullable=True),
        sa.Column("figures", postgresql.JSONB(), nullable=True),
        sa.Column("extracted_figures", postgresql.JSONB(), nullable=True),
        sa.Column("ratios", postgresql.JSONB(), nullable=True),
        sa.Column("narrative", postgresql.JSONB(), nullable=True),
        sa.Column("pdf_url", sa.Text(), nullable=True),
        sa.Column("review_date", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_assessments_user_email", "assessments", ["user_email"])

    op.create_table(
        "credit_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_email", sa.Text(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("pack", sa.Text(), nullable=False),
        sa.Column("credits_added", sa.Integer(), nullable=False),
        sa.Column("amount_kobo", sa.BigInteger(), nullable=False),
        sa.Column("paystack_reference", sa.Text(), nullable=True),
        sa.Column("transaction_type", sa.Text(), nullable=False),
        sa.Column("assessment_id", sa.Integer(), sa.ForeignKey("assessments.id"), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("paystack_reference", name="uq_paystack_reference"),
    )
    op.create_index("ix_credit_transactions_user_email", "credit_transactions", ["user_email"])


def downgrade() -> None:
    op.drop_index("ix_credit_transactions_user_email", table_name="credit_transactions")
    op.drop_table("credit_transactions")
    op.drop_index("ix_assessments_user_email", table_name="assessments")
    op.drop_table("assessments")
    op.drop_index("ix_otps_email", table_name="otps")
    op.drop_table("otps")
    op.drop_index("ix_registrations_email", table_name="registrations")
    op.drop_table("registrations")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_table("tenants")
