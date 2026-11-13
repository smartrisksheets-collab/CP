"""
Uploaded document checks and Claude content blocks.

Each document slot holds exactly one PDF (D046). Photos are no longer accepted:
scanned PDFs still work, because Claude reads PDF pages as images.
Type is decided by the file's bytes, never its name or browser content type.
"""
import base64

from fastapi import HTTPException, UploadFile

MAX_DOCUMENT_MB = 20   # per slot; base64 inflates by a third, keeping one request under Claude's 32MB cap

_IMAGE_SIGNATURES = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")
_HEIF_BRANDS = (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1")

PDF_ONLY = "only PDF files are accepted. Scan or save the document as a PDF and upload again."


def sniff_media_type(content: bytes) -> str | None:
    """'application/pdf' for a PDF, otherwise None."""
    return "application/pdf" if content[:4] == b"%PDF" else None


def _is_image(content: bytes) -> bool:
    return (content.startswith(_IMAGE_SIGNATURES)
            or (content[:4] == b"RIFF" and content[8:12] == b"WEBP")
            or (content[4:8] == b"ftyp" and content[8:12] in _HEIF_BRANDS))


def _reject(label: str, message: str, status_code: int = 400) -> None:
    raise HTTPException(status_code=status_code, detail=f"{label}: {message}")


async def read_document(files: list[UploadFile], label: str) -> list[dict]:
    """
    Read and check one document slot, then return its Claude content block.
    Raises HTTPException before any credit is charged, so a bad file costs nothing.
    """
    if not files:
        _reject(label, "no file was uploaded.")
    if len(files) > 1:
        _reject(label, "upload one PDF per document.")

    upload  = files[0]
    content = await upload.read()
    if not content:
        _reject(label, f"{upload.filename or 'the file'} is empty.")
    if sniff_media_type(content) is None:
        _reject(label, ("photos are no longer accepted; " if _is_image(content) else "") + PDF_ONLY, 415)
    if len(content) > MAX_DOCUMENT_MB * 1024 * 1024:
        _reject(label, f"upload exceeds the {MAX_DOCUMENT_MB}MB limit.", 413)

    return [{
        "type"  : "document",
        "source": {
            "type"      : "base64",
            "media_type": "application/pdf",
            "data"      : base64.b64encode(content).decode(),
        },
    }]
