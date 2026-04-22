from sqlalchemy import (
    Integer, Boolean, Text, DateTime,
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

    users       : Mapped[List["User"]]       = relationship(back_populates="tenant")
    otps        : Mapped[List["OTP"]]        = relationship(back_populates="tenant")
    assessments : Mapped[List["Assessment"]] = relationship(back_populates="tenant")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", "tenant_id", name="uq_user_email_tenant"),
    )

    id          : Mapped[int]      = mapped_column(Integer, primary_key=True)
    email       : Mapped[str]      = mapped_column(Text, nullable=False)
    tenant_id   : Mapped[int]      = mapped_column(ForeignKey("tenants.id"), nullable=False)
    plan        : Mapped[str]      = mapped_column(Text, default="free")
    credits     : Mapped[int]      = mapped_column(Integer, default=0)
    created_at  : Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant      : Mapped["Tenant"] = relationship(back_populates="users")


class OTP(Base):
    __tablename__ = "otps"

    id          : Mapped[int]      = mapped_column(Integer, primary_key=True)
    email       : Mapped[str]      = mapped_column(Text, nullable=False, index=True)
    tenant_id   : Mapped[int]      = mapped_column(ForeignKey("tenants.id"), nullable=False)
    code_hash   : Mapped[str]      = mapped_column(Text, nullable=False)
    expires_at  : Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used        : Mapped[bool]     = mapped_column(Boolean, default=False)
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
    figures       : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)
    ratios        : Mapped[Optional[list]]= mapped_column(JSONB, nullable=True)
    narrative     : Mapped[Optional[dict]]= mapped_column(JSONB, nullable=True)
    pdf_url       : Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at    : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant        : Mapped["Tenant"]      = relationship(back_populates="assessments")