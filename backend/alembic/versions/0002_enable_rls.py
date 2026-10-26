"""enable row level security on all tables

Supabase exposes the public schema through its Data API (anon and
authenticated roles). RLS with no policies denies those roles; the app
connects as the table owner, which RLS does not apply to.

Revision ID: 0002_enable_rls
Revises: 0001_baseline
Create Date: 2026-10-26

"""
from alembic import op

revision: str = "0002_enable_rls"
down_revision: str | None = "0001_baseline"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None

TABLES = [
    "tenants",
    "users",
    "registrations",
    "otps",
    "assessments",
    "credit_transactions",
    "alembic_version",
]


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
