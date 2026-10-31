from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import logging
import os

from api.db import engine
from api.routes import auth, assessment, quota, tenant, register, payments, admin

load_dotenv()

ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
ENVIRONMENT     = os.getenv("ENVIRONMENT", "development")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is managed by Alembic (alembic upgrade head), not created here
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

# Registered before CORSMiddleware so it sits inside it: an unhandled error then
# returns JSON with CORS headers, instead of a bare 500 the browser reports as
# a network failure ("check your internet connection") with no detail.
@app.middleware("http")
async def unhandled_error_as_json(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logging.getLogger("smartrisk").exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again."})


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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