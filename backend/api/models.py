from sqlalchemy import (
    Integer, String, Boolean, Text, DateTime,
    ForeignKey, ARRAY, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from api.db import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id              : Mapped[int]           = mapped_column(Integer, primary_key=True)
    hostname        : Mapped[str]           = mapped_column(Text, unique=True, nullable=False)
    client_name     : Mapped[str]           = mapped_column(Text, nullable=False)
    logo_url        : Mapped[str | None]    = mapped_column(Text)
    primary_color   : Mapped[str]           = mapped_column(Text, default="#1F2854")
    primary_hover   : Mapped[str]           = mapped_column(Text, default="#2A3870")
    accent_color    : Mapped[str]           = mapped_column(Text, default="#01b88e")
    accent_hover    : Mapped[str]           = mapped_column(Text, default="#019B78")
    accent_rgb      : Mapped[str]           = mapped_column(Text, default="1,184,142")
    login_eyebrow   : Mapped[str | None]    = mapped_column(Text)
    login_subtext   : Mapped[str | None]    = mapped_column(Text)
    admin_email     : Mapped[str | None]    = mapped_column(Text)
    access_code     : Mapped[str | None]    = mapped_column(Text)
    allowed_emails  : Mapped[list]          = mapped_column(ARRAY(Text), default=list)
    allowed_domains : Mapped[list]          = mapped_column(ARRAY(Text), default=list)
    session_ttl     : Mapped[int]           = mapped_column(Integer, default=86400)
    created_at      : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    users       : Mapped[list["User"]]       = relationship(back_populates="tenant")
    otps        : Mapped[list["OTP"]]        = relationship(back_populates="tenant")
    assessments : Mapped[list["Assessment"]] = relationship(back_populates="tenant")


class User(Base):
    __tablename__ = "users"

    id          : Mapped[int]           = mapped_column(Integer, primary_key=True)
    email       : Mapped[str]           = mapped_column(Text, nullable=False)
    tenant_id   : Mapped[int]           = mapped_column(ForeignKey("tenants.id"), nullable=False)
    plan        : Mapped[str]           = mapped_column(Text, default="free")
    credits     : Mapped[int]           = mapped_column(Integer, default=0)
    created_at  : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant      : Mapped["Tenant"]      = relationship(back_populates="users")


class OTP(Base):
    __tablename__ = "otps"

    id          : Mapped[int]           = mapped_column(Integer, primary_key=True)
    email       : Mapped[str]           = mapped_column(Text, nullable=False, index=True)
    tenant_id   : Mapped[int]           = mapped_column(ForeignKey("tenants.id"), nullable=False)
    code_hash   : Mapped[str]           = mapped_column(Text, nullable=False)
    expires_at  : Mapped[datetime]      = mapped_column(DateTime(timezone=True), nullable=False)
    used        : Mapped[bool]          = mapped_column(Boolean, default=False)
    created_at  : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant      : Mapped["Tenant"]      = relationship(back_populates="otps")


class Assessment(Base):
    __tablename__ = "assessments"

    id              : Mapped[int]           = mapped_column(Integer, primary_key=True)
    user_email      : Mapped[str]           = mapped_column(Text, nullable=False, index=True)
    tenant_id       : Mapped[int]           = mapped_column(ForeignKey("tenants.id"), nullable=False)
    client_name     : Mapped[str | None]    = mapped_column(Text)
    credit_rating   : Mapped[str | None]    = mapped_column(Text)
    total_score     : Mapped[int | None]    = mapped_column(Integer)
    max_score       : Mapped[int]           = mapped_column(Integer, default=56)
    eligible        : Mapped[bool | None]   = mapped_column(Boolean)
    figures         : Mapped[dict | None]   = mapped_column(JSONB)
    ratios          : Mapped[list | None]   = mapped_column(JSONB)
    narrative       : Mapped[dict | None]   = mapped_column(JSONB)
    pdf_url         : Mapped[str | None]    = mapped_column(Text)
    created_at      : Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant          : Mapped["Tenant"]      = relationship(back_populates="assessments")