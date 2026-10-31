"""
Uploaded document checks and Claude content blocks.

A document slot holds either one PDF or up to MAX_IMAGES photos of its pages.
Type is decided by the file's bytes, never its name or browser content type.
Claude reads PDF pages as images, so scanned PDFs need no text layer.
"""
import base64

from fastapi import HTTPException, UploadFile

MAX_DOCUMENT_MB = 20   # per slot; base64 inflates by a third, keeping one request under Claude's 32MB cap
MAX_IMAGE_MB    = 5    # Claude's per-image limit
MAX_IMAGES      = 20   # above 20 images per request Claude lowers the allowed image size

_IMAGE_SIGNATURES = (
    (b"\xff\xd8\xff",        "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n",   "image/png"),
)
_HEIF_BRANDS = (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1")


def sniff_media_type(content: bytes) -> str | None:
    """Return the media type Claude accepts for these bytes, or None."""
    if content[:4] == b"%PDF":
        return "application/pdf"
    for signature, media_type in _IMAGE_SIGNATURES:
        if content.startswith(signature):
            return media_type
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def _is_heif(content: bytes) -> bool:
    return content[4:8] == b"ftyp" and content[8:12] in _HEIF_BRANDS


def _reject(label: str, message: str, status_code: int = 400) -> None:
    raise HTTPException(status_code=status_code, detail=f"{label}: {message}")


async def read_document(files: list[UploadFile], label: str) -> list[dict]:
    """
    Read and check one document slot, then return its Claude content blocks.
    Raises HTTPException before any credit is charged, so a bad file costs nothing.
    """
    if not files:
        _reject(label, "no file was uploaded.")

    parts: list[tuple[str, bytes]] = []
    total = 0
    for upload in files:
        content = await upload.read()
        if not content:
            _reject(label, f"{upload.filename or 'a file'} is empty.")
        if _is_heif(content):
            _reject(label, "HEIC photos are not supported. Save the photo as JPG or PDF and upload again.", 415)
        media_type = sniff_media_type(content)
        if media_type is None:
            _reject(label, "only PDF, JPG, PNG or WebP files are accepted.", 415)
        total += len(content)
        parts.append((media_type, content))

    if total > MAX_DOCUMENT_MB * 1024 * 1024:
        _reject(label, f"upload exceeds the {MAX_DOCUMENT_MB}MB limit.", 413)

    pdfs = [p for p in parts if p[0] == "application/pdf"]
    if pdfs and len(parts) > 1:
        _reject(label, "upload either one PDF or photos of the pages, not both or several PDFs.")
    if not pdfs and len(parts) > MAX_IMAGES:
        _reject(label, f"upload at most {MAX_IMAGES} photos.")

    blocks = []
    for media_type, content in parts:
        if media_type != "application/pdf" and len(content) > MAX_IMAGE_MB * 1024 * 1024:
            _reject(label, f"each photo must be under {MAX_IMAGE_MB}MB.", 413)
        blocks.append({
            "type"  : "document" if media_type == "application/pdf" else "image",
            "source": {
                "type"      : "base64",
                "media_type": media_type,
                "data"      : base64.b64encode(content).decode(),
            },
        })
    return blocks
