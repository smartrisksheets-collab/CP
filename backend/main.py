from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

from api.db import engine, Base
from api.routes import auth, assessment, quota, tenant, register, payments, admin

load_dotenv()

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
ENVIRONMENT     = os.getenv("ENVIRONMENT", "development")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup if they don't exist
    # In production this is handled by Alembic migrations
    if ENVIRONMENT == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from api.deps import limiter

app = FastAPI(
    title="SmartRisk Credit API",
    version="1.0.0",
    docs_url="/docs" if ENVIRONMENT == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,       prefix="/auth",       tags=["auth"])
app.include_router(register.router,   prefix="/auth",       tags=["auth"])
app.include_router(assessment.router, prefix="/assessment", tags=["assessment"])
app.include_router(quota.router,      prefix="/quota",      tags=["quota"])
app.include_router(tenant.router,     prefix="/tenant",     tags=["tenant"])
app.include_router(payments.router,   prefix="/payments",   tags=["payments"])
app.include_router(admin.router,      prefix="/admin",      tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok"}