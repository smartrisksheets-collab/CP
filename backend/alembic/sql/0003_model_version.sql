BEGIN;

-- Running upgrade 0002_enable_rls -> 0003_model_version

ALTER TABLE assessments ADD COLUMN model_version TEXT;

UPDATE assessments
        SET model_version = CASE
            WHEN ratios @> '[{"id": "current_ratio"}]'::jsonb THEN 'v1.1'
            ELSE 'v1.0'
        END
        WHERE status = 'complete';

UPDATE alembic_version SET version_num='0003_model_version' WHERE alembic_version.version_num = '0002_enable_rls';

COMMIT;

