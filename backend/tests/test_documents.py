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
    assert sniff_media_type(JPEG) == "image/jpeg"
    assert sniff_media_type(PNG) == "image/png"
    assert sniff_media_type(WEBP) == "image/webp"
    assert sniff_media_type(b"PK\x03\x04 docx") is None


def test_pdf_becomes_one_document_block():
    blocks = _read(PDF)
    assert [b["type"] for b in blocks] == ["document"]
    assert blocks[0]["source"]["media_type"] == "application/pdf"


def test_photos_become_image_blocks_in_page_order():
    blocks = _read(JPEG, PNG, WEBP)
    assert [b["source"]["media_type"] for b in blocks] == ["image/jpeg", "image/png", "image/webp"]
    assert all(b["type"] == "image" for b in blocks)


def test_image_renamed_pdf_is_read_as_image():
    blocks = asyncio.run(read_document([_upload(JPEG, "statement.pdf")], "Financial statement"))
    assert blocks[0]["type"] == "image"


@pytest.mark.parametrize("parts, code", [
    ((b"",), 400),                 # empty file
    ((b"not a document",), 415),   # unknown type
    ((HEIC,), 415),                # iPhone HEIC
    ((PDF, PDF), 400),             # several PDFs
    ((PDF, JPEG), 400),            # PDF mixed with photos
])
def test_bad_uploads_are_rejected(parts, code):
    assert _status(*parts) == code


def test_photo_count_limit():
    assert len(_read(*[JPEG] * documents.MAX_IMAGES)) == documents.MAX_IMAGES
    assert _status(*[JPEG] * (documents.MAX_IMAGES + 1)) == 400


def test_size_limits(monkeypatch):
    monkeypatch.setattr(documents, "MAX_IMAGE_MB", 0.00001)
    assert _status(JPEG) == 413
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


def _run_extract(financial, rating=None):
    route = inspect.unwrap(assessment.extract)  # skip the rate limiter wrapper
    return asyncio.run(route(
        request=None, financial_pdf=financial, rating_pdf=rating, cp_terms_pdf=None,
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
