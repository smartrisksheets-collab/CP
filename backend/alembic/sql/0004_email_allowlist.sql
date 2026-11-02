BEGIN;

-- Running upgrade 0003_model_version -> 0004_email_allowlist

CREATE TABLE email_allowlist (
    id SERIAL NOT NULL, 
    tenant_id INTEGER NOT NULL, 
    email TEXT NOT NULL, 
    note TEXT, 
    added_by TEXT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    revoked_at TIMESTAMP WITH TIME ZONE, 
    revoked_by TEXT, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_allowlist_tenant_email UNIQUE (tenant_id, email), 
    FOREIGN KEY(tenant_id) REFERENCES tenants (id)
);

ALTER TABLE email_allowlist ENABLE ROW LEVEL SECURITY;

UPDATE alembic_version SET version_num='0004_email_allowlist' WHERE alembic_version.version_num = '0003_model_version';

COMMIT;

