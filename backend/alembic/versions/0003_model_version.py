"""add assessments.model_version

Records which scoring model produced each saved result, so old reports keep
their stored scores when the model changes. Existing rows are backfilled:
v1.1 if the saved ratios include the Current Ratio (added in v1.1), else v1.0.

Revision ID: 0003_model_version
Revises: 0002_enable_rls
Create Date: 2026-10-27

"""
from alembic import op

revision: str = "0003_model_version"
down_revision: str | None = "0002_enable_rls"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE assessments ADD COLUMN model_version TEXT")
    op.execute(
        """
        UPDATE assessments
        SET model_version = CASE
            WHEN ratios @> '[{"id": "current_ratio"}]'::jsonb THEN 'v1.1'
            ELSE 'v1.0'
        END
        WHERE status = 'complete'
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE assessments DROP COLUMN model_version")
