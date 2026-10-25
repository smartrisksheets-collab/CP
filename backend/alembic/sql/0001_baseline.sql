BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001_baseline

CREATE TABLE tenants (
    id SERIAL NOT NULL,
    hostname TEXT NOT NULL,
    client_name TEXT NOT NULL,
    logo_url TEXT,
    primary_color TEXT NOT NULL,
    primary_hover TEXT NOT NULL,
    accent_color TEXT NOT NULL,
    accent_hover TEXT NOT NULL,
    accent_rgb TEXT NOT NULL,
    login_eyebrow TEXT,
    login_subtext TEXT,
    admin_email TEXT,
    access_code TEXT,
    allowed_emails TEXT[] NOT NULL,
    allowed_domains TEXT[] NOT NULL,
    session_ttl INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (hostname)
);

CREATE TABLE users (
    id SERIAL NOT NULL,
    email TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    name TEXT,
    company TEXT,
    role TEXT NOT NULL,
    plan TEXT NOT NULL,
    credits INTEGER NOT NULL,
    credits_expire_at TIMESTAMP WITH TIME ZONE,
    verified BOOLEAN NOT NULL,
    onboarding_role TEXT,
    onboarding_process TEXT,
    onboarding_volume TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_user_email_tenant UNIQUE (email, tenant_id),
    FOREIGN KEY(tenant_id) REFERENCES tenants (id)
);

CREATE INDEX ix_users_email ON users (email);

CREATE TABLE registrations (
    id SERIAL NOT NULL,
    email TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    company TEXT,
    verification_token TEXT NOT NULL,
    token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (verification_token),
    FOREIGN KEY(tenant_id) REFERENCES tenants (id)
);

CREATE INDEX ix_registrations_email ON registrations (email);

CREATE TABLE otps (
    id SERIAL NOT NULL,
    email TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN NOT NULL,
    attempts INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(tenant_id) REFERENCES tenants (id)
);

CREATE INDEX ix_otps_email ON otps (email);

CREATE TABLE assessments (
    id SERIAL NOT NULL,
    user_email TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    client_name TEXT,
    credit_rating TEXT,
    total_score INTEGER,
    max_score INTEGER NOT NULL,
    eligible BOOLEAN,
    figures JSONB,
    extracted_figures JSONB,
    ratios JSONB,
    narrative JSONB,
    pdf_url TEXT,
    review_date TEXT,
    status TEXT NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    FOREIGN KEY(tenant_id) REFERENCES tenants (id)
);

CREATE INDEX ix_assessments_user_email ON assessments (user_email);

CREATE TABLE credit_transactions (
    id SERIAL NOT NULL,
    user_email TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    pack TEXT NOT NULL,
    credits_added INTEGER NOT NULL,
    amount_kobo BIGINT NOT NULL,
    paystack_reference TEXT,
    transaction_type TEXT NOT NULL,
    assessment_id INTEGER,
    status TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_paystack_reference UNIQUE (paystack_reference),
    FOREIGN KEY(tenant_id) REFERENCES tenants (id),
    FOREIGN KEY(assessment_id) REFERENCES assessments (id)
);

CREATE INDEX ix_credit_transactions_user_email ON credit_transactions (user_email);

INSERT INTO alembic_version (version_num) VALUES ('0001_baseline') RETURNING alembic_version.version_num;

COMMIT;

