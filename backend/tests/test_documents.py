import asyncio
import inspect
import io
import os

import pytest
from fastapi import HTTPException, UploadFile

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")  # db.py needs it at import

from api import documents
from api.documents import read_document, sniff_media_type
from api.routes import assessment

PDF  = b"%PDF-1.7\n%scan\n"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
PNG  = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 8
HEIC = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 8


def _upload(data: bytes, name: str = "file.pdf") -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename=name)


def _read(*parts: bytes) -> list[dict]:
    return asyncio.run(read_document([_upload(p) for p in parts], "Financial statement"))


def _status(*parts: bytes) -> int:
    with pytest.raises(HTTPException) as exc:
        _read(*parts)
    return exc.value.status_code


def test_sniff_uses_bytes_not_names():
    assert sniff_media_type(PDF) == "application/pdf"
    for other in (JPEG, PNG, WEBP, HEIC, b"PK\x03\x04 docx"):
        assert sniff_media_type(other) is None


def test_pdf_becomes_one_document_block():
    blocks = _read(PDF)
    assert [b["type"] for b in blocks] == ["document"]
    assert blocks[0]["source"]["media_type"] == "application/pdf"


def test_renamed_photo_is_still_rejected():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(read_document([_upload(JPEG, "statement.pdf")], "Financial statement"))
    assert exc.value.status_code == 415 and "photos are no longer accepted" in exc.value.detail


@pytest.mark.parametrize("parts, code", [
    ((b"",), 400),                 # empty file
    ((b"not a document",), 415),   # unknown type
    ((JPEG,), 415),                # photos are PDF-only now (D046)
    ((PNG,), 415),
    ((WEBP,), 415),
    ((HEIC,), 415),
    ((PDF, PDF), 400),             # several PDFs
    ((JPEG, JPEG), 400),           # several photos
])
def test_bad_uploads_are_rejected(parts, code):
    assert _status(*parts) == code


def test_size_limit(monkeypatch):
    monkeypatch.setattr(documents, "MAX_DOCUMENT_MB", 0.00001)
    assert _status(PDF) == 413


def test_no_file_is_rejected():
    with pytest.raises(HTTPException):
        asyncio.run(read_document([], "CP terms"))


# ── /assessment/extract charges only after every file passes ──────────
class _Calls:
    def __init__(self):
        self.charged = 0
        self.refunded = 0


def _patch_route(monkeypatch, calls: _Calls, extract_result=None, extract_error=None):
    async def get_user(*_):
        return object()

    async def check_quota(*_):
        return None

    async def charge(*_):
        calls.charged += 1
        return 7

    async def refund(_user, debit_id, _db):
        assert debit_id == 7
        calls.refunded += 1

    async def extract(_blocks):
        if extract_error:
            raise extract_error
        return extract_result

    monkeypatch.setattr(assessment, "_get_user", get_user)
    monkeypatch.setattr(assessment, "_check_quota", check_quota)
    monkeypatch.setattr(assessment, "_decrement_credits", charge)
    monkeypatch.setattr(assessment, "_refund_credit", refund)
    monkeypatch.setattr(assessment, "extract_figures", extract)

    async def history_off(*_):
        return "off"

    monkeypatch.setattr(assessment, "_history_mode", history_off)
    monkeypatch.setattr(assessment, "_fi_mode", history_off)


def _run_extract(financial, rating=None):
    route = inspect.unwrap(assessment.extract)  # skip the rate limiter wrapper
    return asyncio.run(route(
        request=None, financial_pdf=financial, rating_pdf=rating, cp_terms_pdf=None,
        prior_pdf=None, older_pdf=None, interim_pdf=None, rc_number=None, sector=None,
        client_name=None, draft_id=None, current_user={"email": "a@b.c", "tenant_id": 1}, db=None,
    ))


def test_invalid_rating_file_rejected_before_charge(monkeypatch):
    calls = _Calls()
    _patch_route(monkeypatch, calls, extract_result={})
    with pytest.raises(HTTPException):
        _run_extract([_upload(PDF)], rating=[_upload(b"junk")])
    assert calls.charged == 0


def test_failed_extraction_refunds(monkeypatch):
    calls = _Calls()
    _patch_route(monkeypatch, calls, extract_error=RuntimeError("The AI response could not be read."))
    with pytest.raises(HTTPException) as exc:
        _run_extract([_upload(PDF)])
    assert exc.value.status_code == 502
    assert (calls.charged, calls.refunded) == (1, 1)


def test_unparseable_ai_reply_is_runtime_error():
    from api.claude import _parse_json
    with pytest.raises(RuntimeError):
        _parse_json("no json here")
    with pytest.raises(RuntimeError):
        _parse_json("prefix {broken: json} suffix")
