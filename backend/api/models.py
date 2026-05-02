from sqlalchemy import (
    Integer, Boolean, Text, DateTime, BigInteger,
    ForeignKey, ARRAY, func, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from datetime import datetime
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
    eligible      : Mapped[Optional[bool]]= mapped_column(Boolean, nullable=True)
    figures            : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)
    extracted_figures  : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)  # AI-extracted, pre-edit
    ratios             : Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    narrative          : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)
    pdf_url            : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    review_date        : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
    pack                 : Mapped[str]           = mapped_column(Text, nullable=False)     # starter | standard | professional | team | free
    credits_added        : Mapped[int]           = mapped_column(Integer, nullable=False)
    amount_kobo          : Mapped[int]           = mapped_column(BigInteger, default=0)    # 0 for free credits
    paystack_reference   : Mapped[Optional[str]] = mapped_column(Text, nullable=True)     # null for free credits
    status               : Mapped[str]           = mapped_column(Text, default="success") # success | failed | refunded
    expires_at           : Mapped[datetime]      = mapped_column(DateTime(timezone=True), nullable=False)
    created_at           : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant               : Mapped["Tenant"]      = relationship(back_populates="credit_transactions")