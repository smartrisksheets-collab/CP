BEGIN;

-- Running upgrade 0001_baseline -> 0002_enable_rls

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE otps ENABLE ROW LEVEL SECURITY;

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY;

UPDATE alembic_version SET version_num='0002_enable_rls' WHERE alembic_version.version_num = '0001_baseline';

COMMIT;

