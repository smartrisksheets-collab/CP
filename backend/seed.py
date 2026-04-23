import asyncio
from sqlalchemy import select
from api.db import SessionLocal, engine, Base
from api.models import Tenant
from dotenv import load_dotenv

load_dotenv()


TENANTS = [
    {
        "hostname"       : "scores.smartrisksheets.com",
        "client_name"    : "SmartRisk Sheets",
        "logo_url"       : "https://smartrisksheets.com/wp-content/uploads/2025/07/SmartRisk-Sheets-Logo.png",
        "primary_color"  : "#1F2854",
        "primary_hover"  : "#2A3870",
        "accent_color"   : "#01b88e",
        "accent_hover"   : "#019B78",
        "accent_rgb"     : "1,184,142",
        "login_eyebrow"  : "Analyst Portal",
        "login_subtext"  : "Sign in to access SmartRisk Credit — AI-powered credit risk assessment.",
        "admin_email"    : "info@smartrisksheets.com",
        "access_code"    : None,
        "allowed_emails" : [
            "smartrisksheets@gmail.com",
            "chineduozulumba@yahoo.com",
            "cozulumba@parthianpartnersng.com",
        ],
        "allowed_domains": [],
        "session_ttl"    : 172800,
    },
    {
        "hostname"       : "credit.smartrisksheets.com",
        "client_name"    : "Parthian Partners",
        "logo_url"       : "https://smartrisksheets.com/wp-content/uploads/2026/04/Parthian-Partners-Logo-black.png",
        "primary_color"  : "#2C2C2C",
        "primary_hover"  : "#444444",
        "accent_color"   : "#C8A217",
        "accent_hover"   : "#B8920F",
        "accent_rgb"     : "200,162,23",
        "login_eyebrow"  : "Risk Assurance Portal",
        "login_subtext"  : "Sign in to access the Credit Risk Assessment tool.",
        "admin_email"    : "admin@smartrisksheets.com",
        "access_code"    : None,
        "allowed_emails" : [
            "admin@smartrisksheets.com",
            "cozulumba@parthianpartnersng.com",
            "flanlehin@parthianpartnersng.com",
        ],
        "allowed_domains": ["smartrisksheets.com"],
        "session_ttl"    : 86400,
    },
    {
        "hostname"       : "localhost",
        "client_name"    : "SmartRisk Credit",
        "logo_url"       : None,
        "primary_color"  : "#1F2854",
        "primary_hover"  : "#2A3870",
        "accent_color"   : "#01b88e",
        "accent_hover"   : "#019B78",
        "accent_rgb"     : "1,184,142",
        "login_eyebrow"  : "Dev Portal",
        "login_subtext"  : "Local development environment.",
        "admin_email"    : "dev@smartrisksheets.com",
        "access_code"    : None,
        "allowed_emails" : [],
        "allowed_domains": ["*"],
        "session_ttl"    : 86400,
    },
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        for data in TENANTS:
            result = await db.execute(
                select(Tenant).where(Tenant.hostname == data["hostname"])
            )
            existing = result.scalar_one_or_none()

            if existing:
                for key, val in data.items():
                    setattr(existing, key, val)
                print(f"Updated tenant: {data['hostname']}")
            else:
                db.add(Tenant(**data))
                print(f"Created tenant: {data['hostname']}")

        await db.commit()
        print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())