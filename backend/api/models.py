from sqlalchemy import (
    Integer, Boolean, Text, DateTime, Date, BigInteger, Float,
    ForeignKey, ARRAY, func, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from datetime import datetime, date
from api.db import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id              : Mapped[int]           = mapped_column(Integer, primary_key=True)
    hostname        : Mapped[str]           = mapped_column(Text, unique=True, nullable=False)
    client_name     : Mapped[str]           = mapped_column(Text, nullable=False)
    logo_url        : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    primary_color   : Mapped[str]           = mapped_column(Text, default="#1F2854")
    primary_hover   : Mapped[str]           = mapped_column(Text, default="#2A3870")
    accent_color    : Mapped[str]           = mapped_column(Text, default="#01b88e")
    accent_hover    : Mapped[str]           = mapped_column(Text, default="#019B78")
    accent_rgb      : Mapped[str]           = mapped_column(Text, default="1,184,142")
    login_eyebrow   : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    login_subtext   : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_email     : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    access_code     : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    allowed_emails  : Mapped[List]          = mapped_column(ARRAY(Text), default=list)
    allowed_domains : Mapped[List]          = mapped_column(ARRAY(Text), default=list)
    session_ttl     : Mapped[int]           = mapped_column(Integer, default=86400)
    history_mode    : Mapped[str]           = mapped_column(Text, default="off", server_default="off")  # off | shadow
    fi_mode         : Mapped[str]           = mapped_column(Text, default="off", server_default="off")  # off | shadow (sector + FI ratios)
    instrument_mode : Mapped[str]           = mapped_column(Text, default="off", server_default="off")  # off | on (bonds, loans, reviews)
    created_at      : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    users                : Mapped[List["User"]]               = relationship(back_populates="tenant")
    otps                 : Mapped[List["OTP"]]                = relationship(back_populates="tenant")
    assessments          : Mapped[List["Assessment"]]         = relationship(back_populates="tenant")
    credit_transactions  : Mapped[List["CreditTransaction"]]  = relationship(back_populates="tenant")
    registrations        : Mapped[List["Registration"]]       = relationship(back_populates="tenant")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", "tenant_id", name="uq_user_email_tenant"),
    )

    id           : Mapped[int]           = mapped_column(Integer, primary_key=True)
    email        : Mapped[str]           = mapped_column(Text, nullable=False, index=True)
    tenant_id    : Mapped[int]           = mapped_column(ForeignKey("tenants.id"), nullable=False)
    name         : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    company      : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role         : Mapped[str]           = mapped_column(Text, default="user")   # user | admin | superadmin
    plan         : Mapped[str]           = mapped_column(Text, default="free")   # last pack purchased
    credits            : Mapped[int]           = mapped_column(Integer, default=0)
    credits_expire_at  : Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    verified           : Mapped[bool]           = mapped_column(Boolean, default=False)
    onboarding_role    : Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    onboarding_process : Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    onboarding_volume  : Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    created_at         : Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant       : Mapped["Tenant"]      = relationship(back_populates="users")


class Registration(Base):
    """
    Holds pending registrations until email is verified.
    Credits are only granted after verification.
    """
    __tablename__ = "registrations"

    id                  : Mapped[int]           = mapped_column(Integer, primary_key=True)
    email               : Mapped[str]           = mapped_column(Text, nullable=False, index=True)
    tenant_id           : Mapped[int]           = mapped_column(ForeignKey("tenants.id"), nullable=False)
    name                : Mapped[str]           = mapped_column(Text, nullable=False)
    company             : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verification_token  : Mapped[str]           = mapped_column(Text, unique=True, nullable=False)
    token_expires_at    : Mapped[datetime]      = mapped_column(DateTime(timezone=True), nullable=False)
    verified            : Mapped[bool]          = mapped_column(Boolean, default=False)
    created_at          : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant              : Mapped["Tenant"]      = relationship(back_populates="registrations")


class OTP(Base):
    __tablename__ = "otps"

    id          : Mapped[int]      = mapped_column(Integer, primary_key=True)
    email       : Mapped[str]      = mapped_column(Text, nullable=False, index=True)
    tenant_id   : Mapped[int]      = mapped_column(ForeignKey("tenants.id"), nullable=False)
    code_hash   : Mapped[str]      = mapped_column(Text, nullable=False)
    expires_at  : Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used        : Mapped[bool]     = mapped_column(Boolean, default=False)
    attempts    : Mapped[int]      = mapped_column(Integer, default=0)
    created_at  : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant      : Mapped["Tenant"] = relationship(back_populates="otps")


class Assessment(Base):
    __tablename__ = "assessments"

    id            : Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_email    : Mapped[str]           = mapped_column(Text, nullable=False, index=True)
    tenant_id     : Mapped[int]           = mapped_column(ForeignKey("tenants.id"), nullable=False)
    client_name   : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    credit_rating : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_score   : Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_score     : Mapped[int]           = mapped_column(Integer, default=56)
    model_version : Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # scoring model used, e.g. "v1.2"
    eligible      : Mapped[Optional[bool]]= mapped_column(Boolean, nullable=True)
    figures            : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)
    extracted_figures  : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)  # AI-extracted, pre-edit
    ratios             : Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    narrative          : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)
    pdf_url            : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    review_date        : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rc_number          : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    history            : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)  # history analysis (api/history.py)
    sector             : Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # api/fi.py SECTORS code
    fi                 : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)  # FI ratios + peer medians at run time
    instrument         : Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # api/instruments.py code; None = cp
    status             : Mapped[str]                = mapped_column(Text, default="complete")
    deleted_at         : Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at         : Mapped[datetime]           = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at         : Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    tenant        : Mapped["Tenant"]      = relationship(back_populates="assessments")


class CreditTransaction(Base):
    """
    Full audit trail of every credit purchase.
    paystack_reference is UNIQUE — prevents double-crediting on duplicate webhooks.
    expires_at is 12 months from purchase date.
    """
    __tablename__ = "credit_transactions"
    __table_args__ = (
        UniqueConstraint("paystack_reference", name="uq_paystack_reference"),
    )

    id                   : Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_email           : Mapped[str]           = mapped_column(Text, nullable=False, index=True)
    tenant_id            : Mapped[int]           = mapped_column(ForeignKey("tenants.id"), nullable=False)
    pack                 : Mapped[str]           = mapped_column(Text, nullable=False)
    credits_added        : Mapped[int]           = mapped_column(Integer, nullable=False)  # positive = credit, negative = debit
    amount_kobo          : Mapped[int]           = mapped_column(BigInteger, default=0)
    paystack_reference   : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transaction_type     : Mapped[str]           = mapped_column(Text, default="purchase") # purchase | usage | refund | free
    assessment_id        : Mapped[Optional[int]] = mapped_column(ForeignKey("assessments.id"), nullable=True)
    status               : Mapped[str]           = mapped_column(Text, default="success") # success | failed | refunded
    expires_at           : Mapped[datetime]      = mapped_column(DateTime(timezone=True), nullable=False)
    created_at           : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant               : Mapped["Tenant"]      = relationship(back_populates="credit_transactions")

class EmailAllowlist(Base):
    """
    Personal email addresses (gmail, yahoo, ...) an admin lets register on
    one tenant, usually for test users. One row per email per tenant:
    revoking sets revoked_at, re-adding clears it.
    """
    __tablename__ = "email_allowlist"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_allowlist_tenant_email"),
    )

    id         : Mapped[int]             = mapped_column(Integer, primary_key=True)
    tenant_id  : Mapped[int]             = mapped_column(ForeignKey("tenants.id"), nullable=False)
    email      : Mapped[str]             = mapped_column(Text, nullable=False)
    note       : Mapped[str | None]      = mapped_column(Text, nullable=True)
    added_by   : Mapped[str]             = mapped_column(Text, nullable=False)
    created_at : Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    revoked_at : Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by : Mapped[str | None]      = mapped_column(Text, nullable=True)


class Issuer(Base):
    """An issuer on one tenant, keyed by RC number. History is never shared across tenants."""
    __tablename__ = "issuers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "rc_number", name="uq_issuer_tenant_rc"),
    )

    id         : Mapped[int]                = mapped_column(Integer, primary_key=True)
    tenant_id  : Mapped[int]                = mapped_column(ForeignKey("tenants.id"), nullable=False)
    rc_number  : Mapped[str]                = mapped_column(Text, nullable=False)
    name       : Mapped[Optional[str]]      = mapped_column(Text, nullable=True)
    created_at : Mapped[datetime]           = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at : Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class IssuerPeriod(Base):
    """
    Confirmed figures for one financial year or half-year of an issuer.
    One row per period; a newer document's figures replace older ones and the
    replaced figures are kept in previous_figures.
    """
    __tablename__ = "issuer_periods"
    __table_args__ = (
        UniqueConstraint("issuer_id", "period_end", "period_months", name="uq_issuer_period"),
    )

    id               : Mapped[int]                = mapped_column(Integer, primary_key=True)
    tenant_id        : Mapped[int]                = mapped_column(ForeignKey("tenants.id"), nullable=False)
    issuer_id        : Mapped[int]                = mapped_column(ForeignKey("issuers.id", ondelete="CASCADE"), nullable=False)
    period_end       : Mapped[date]               = mapped_column(Date, nullable=False)
    period_months    : Mapped[int]                = mapped_column(Integer, nullable=False)
    audited          : Mapped[Optional[bool]]     = mapped_column(Boolean, nullable=True)
    basis            : Mapped[Optional[str]]      = mapped_column(Text, nullable=True)
    figures          : Mapped[dict]               = mapped_column(JSONB, nullable=False)
    doc_period_end   : Mapped[date]               = mapped_column(Date, nullable=False)
    source           : Mapped[str]                = mapped_column(Text, nullable=False)
    one_off          : Mapped[Optional[dict]]     = mapped_column(JSONB, nullable=True)
    previous_figures : Mapped[Optional[dict]]     = mapped_column(JSONB, nullable=True)
    assessment_id    : Mapped[Optional[int]]      = mapped_column(ForeignKey("assessments.id"), nullable=True)
    created_at       : Mapped[datetime]           = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at       : Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class PeerBenchmark(Base):
    """
    A peer median for one ratio, sector and financial year (api/benchmarks.py). Shown only
    once verified against the filed statements. Not tenant data: the same for every tenant.
    """
    __tablename__ = "peer_benchmarks"
    __table_args__ = (
        UniqueConstraint("sector", "ratio_id", "fiscal_year", "peer_group", name="uq_peer_benchmark"),
    )

    id          : Mapped[int]                = mapped_column(Integer, primary_key=True)
    sector      : Mapped[str]                = mapped_column(Text, nullable=False)
    ratio_id    : Mapped[str]                = mapped_column(Text, nullable=False)
    fiscal_year : Mapped[int]                = mapped_column(Integer, nullable=False)
    peer_group  : Mapped[str]                = mapped_column(Text, nullable=False)
    median      : Mapped[float]              = mapped_column(Float, nullable=False)
    p25         : Mapped[Optional[float]]    = mapped_column(Float, nullable=True)
    p75         : Mapped[Optional[float]]    = mapped_column(Float, nullable=True)
    n           : Mapped[int]                = mapped_column(Integer, nullable=False)
    source_note : Mapped[Optional[str]]      = mapped_column(Text, nullable=True)
    company_values : Mapped[Optional[list]]  = mapped_column(JSONB, nullable=True)  # company, value, source
    verified    : Mapped[bool]               = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    verified_at : Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at  : Mapped[datetime]           = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
