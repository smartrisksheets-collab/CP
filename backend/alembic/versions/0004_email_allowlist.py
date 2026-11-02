"""add email_allowlist

Personal email addresses an admin allows to register on a tenant (test
users). Revoked rows are kept (revoked_at, revoked_by) and block access.
RLS is enabled to match 0002_enable_rls.

Revision ID: 0004_email_allowlist
Revises: 0003_model_version
Create Date: 2026-11-02

"""
from alembic import op
import sqlalchemy as sa

revision: str = "0004_email_allowlist"
down_revision: str | None = "0003_model_version"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "email_allowlist",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("added_by", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.Text(), nullable=True),
        sa.UniqueConstraint("tenant_id", "email", name="uq_allowlist_tenant_email"),
    )
    op.execute("ALTER TABLE email_allowlist ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("email_allowlist")
