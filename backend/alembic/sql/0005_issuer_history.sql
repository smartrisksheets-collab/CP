BEGIN;

-- Running upgrade 0004_email_allowlist -> 0005_issuer_history

CREATE TABLE issuers (
    id SERIAL NOT NULL, 
    tenant_id INTEGER NOT NULL, 
    rc_number TEXT NOT NULL, 
    name TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_issuer_tenant_rc UNIQUE (tenant_id, rc_number), 
    FOREIGN KEY(tenant_id) REFERENCES tenants (id)
);

CREATE TABLE issuer_periods (
    id SERIAL NOT NULL, 
    tenant_id INTEGER NOT NULL, 
    issuer_id INTEGER NOT NULL, 
    period_end DATE NOT NULL, 
    period_months INTEGER NOT NULL, 
    audited BOOLEAN, 
    basis TEXT, 
    figures JSONB NOT NULL, 
    doc_period_end DATE NOT NULL, 
    source TEXT NOT NULL, 
    one_off JSONB, 
    previous_figures JSONB, 
    assessment_id INTEGER, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_issuer_period UNIQUE (issuer_id, period_end, period_months), 
    FOREIGN KEY(tenant_id) REFERENCES tenants (id), 
    FOREIGN KEY(issuer_id) REFERENCES issuers (id) ON DELETE CASCADE, 
    FOREIGN KEY(assessment_id) REFERENCES assessments (id)
);

ALTER TABLE issuers ENABLE ROW LEVEL SECURITY;

ALTER TABLE issuer_periods ENABLE ROW LEVEL SECURITY;

ALTER TABLE assessments ADD COLUMN rc_number TEXT;

ALTER TABLE assessments ADD COLUMN history JSONB;

ALTER TABLE tenants ADD COLUMN history_mode TEXT DEFAULT 'off' NOT NULL;

UPDATE alembic_version SET version_num='0005_issuer_history' WHERE alembic_version.version_num = '0004_email_allowlist';

COMMIT;

