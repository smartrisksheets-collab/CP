BEGIN;

-- Running upgrade 0006_fi_peers -> 0007_instruments

ALTER TABLE assessments ADD COLUMN instrument TEXT;

ALTER TABLE tenants ADD COLUMN instrument_mode TEXT DEFAULT 'off' NOT NULL;

UPDATE alembic_version SET version_num='0007_instruments' WHERE alembic_version.version_num = '0006_fi_peers';

COMMIT;

