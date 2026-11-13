BEGIN;

-- Running upgrade 0005_issuer_history -> 0006_fi_peers

CREATE TABLE peer_benchmarks (
    id SERIAL NOT NULL, 
    sector TEXT NOT NULL, 
    ratio_id TEXT NOT NULL, 
    fiscal_year INTEGER NOT NULL, 
    peer_group TEXT NOT NULL, 
    median FLOAT NOT NULL, 
    p25 FLOAT, 
    p75 FLOAT, 
    n INTEGER NOT NULL, 
    source_note TEXT, 
    company_values JSONB, 
    verified BOOLEAN DEFAULT false NOT NULL, 
    verified_at TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_peer_benchmark UNIQUE (sector, ratio_id, fiscal_year, peer_group)
);

ALTER TABLE peer_benchmarks ENABLE ROW LEVEL SECURITY;

ALTER TABLE assessments ADD COLUMN sector TEXT;

ALTER TABLE assessments ADD COLUMN fi JSONB;

ALTER TABLE tenants ADD COLUMN fi_mode TEXT DEFAULT 'off' NOT NULL;

UPDATE alembic_version SET version_num='0006_fi_peers' WHERE alembic_version.version_num = '0005_issuer_history';

COMMIT;

