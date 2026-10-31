// Shared handling for uploaded documents: one PDF, or photos of the pages.
// The backend re-checks everything; these checks give the user a fast, clear answer first.

export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
export const MAX_DOCUMENT_MB = 20;   // matches backend/api/documents.py
export const MAX_PHOTOS      = 20;   // matches backend/api/documents.py
const MAX_PDF_PAGES  = 600;          // Claude's page limit per request for this model
const PHOTO_EDGE     = 2576;         // longest edge the model reads at full detail
const PHOTO_QUALITY  = 0.85;
const MIN_PAGE_TEXT  = 50;           // characters below which a page may be a scan

export const PHOTO_WARNING = "Photos accepted. The AI reads them directly, but automatic document checks were skipped. Review every extracted figure carefully.";

// ── PDF.js ────────────────────────────────────────────────
let _pdfjs = null;
async function loadPdfJs() {
  if (_pdfjs) return _pdfjs;
  if (window.pdfjsLib) { _pdfjs = window.pdfjsLib; return _pdfjs; }
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  _pdfjs = window.pdfjsLib;
  return _pdfjs;
}

// Reads the text layer of up to maxPages and counts pages that are scanned images.
// Returns { error } for files that can never be extracted (password, damaged, too long).
// Throws only if PDF.js itself cannot load; callers then accept the file with a warning.
export async function inspectPdf(file, maxPages) {
  const lib = await loadPdfJs();
  let pdf;
  try {
    pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  } catch (e) {
    if (e?.name === "PasswordException") {
      return { error: "This PDF is password-protected. Save an unlocked copy, or upload photos of the pages, and try again." };
    }
    return { error: "This PDF is damaged or unreadable. Re-save or re-scan it and try again." };
  }
  if (!pdf.numPages) return { error: "This PDF has no pages." };
  if (pdf.numPages > MAX_PDF_PAGES) {
    return { error: `This PDF has ${pdf.numPages} pages. The limit is ${MAX_PDF_PAGES}; upload only the financial statements section.` };
  }

  const imageOps = new Set(
    [lib.OPS.paintImageXObject, lib.OPS.paintInlineImageXObject, lib.OPS.paintJpegXObject].filter((op) => op !== undefined)
  );
  const n = Math.min(pdf.numPages, maxPages);
  let text = "", imagePages = 0;
  for (let i = 1; i <= n; i++) {
    const page     = await pdf.getPage(i);
    const pageText = (await page.getTextContent()).items.map((s) => s.str).join(" ");
    text += pageText + " ";
    // A page with little text is a scan only if it paints an image (blank pages do not count)
    if (pageText.replace(/\s/g, "").length < MIN_PAGE_TEXT) {
      const ops = await page.getOperatorList();
      if (ops.fnArray.some((fn) => imageOps.has(fn))) imagePages++;
    }
  }
  return { text, numPages: pdf.numPages, imagePages };
}

// ── File preparation ──────────────────────────────────────
function kindOf(file) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/^image\/(jpeg|png|webp)$/.test(type) || /\.(jpe?g|png|webp)$/.test(name)) return "image";
  if (/^image\/hei[cf]/.test(type) || /\.hei[cf]$/.test(name)) return "heic";
  return null;
}

// Downscale to PHOTO_EDGE, apply EXIF rotation and re-encode as JPEG so each photo
// stays well under the API's per-image limit and phone pictures arrive upright.
async function compressPhoto(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name} could not be opened as an image. Save it as JPG or PNG and try again.`);
  }
  const scale  = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNG areas become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", PHOTO_QUALITY));
  if (!blob) throw new Error(`${file.name} could not be processed. Try a smaller photo.`);
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

// Turns a FileList into a document: { kind: "pdf" | "images", name, size, files }.
// Returns { error } when the selection can never be uploaded.
export async function prepareDocument(fileList, onProgress) {
  const seen  = new Set();
  const files = Array.from(fileList || []).filter((f) => {
    const key = `${f.name}-${f.size}-${f.lastModified}`; // same photo picked twice
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!files.length) return { error: "No file was selected." };

  const kinds = files.map(kindOf);
  if (kinds.includes("heic")) return { error: "HEIC photos are not supported. Save the photo as JPG or PDF and upload again." };
  if (kinds.includes(null))   return { error: "Only PDF, JPG, PNG or WebP files are accepted." };
  if (kinds.includes("pdf") && files.length > 1) {
    return { error: "Upload one PDF, or photos of the pages, not both or several PDFs." };
  }

  const limit = MAX_DOCUMENT_MB * 1024 * 1024;
  if (kinds[0] === "pdf") {
    const [file] = files;
    if (!file.size)          return { error: "This file is empty." };
    if (file.size > limit)   return { error: `This PDF is larger than ${MAX_DOCUMENT_MB}MB. Compress it or upload only the statements section.` };
    return { doc: { kind: "pdf", name: file.name, size: file.size, files: [file] } };
  }

  if (files.length > MAX_PHOTOS) return { error: `Upload at most ${MAX_PHOTOS} photos.` };
  // Pages are sent in file name order (IMG_2 before IMG_10), the usual camera and scanner naming
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const photos = [];
  try {
    for (let i = 0; i < files.length; i++) {
      photos.push(await compressPhoto(files[i]));
      onProgress?.(Math.round(((i + 1) / files.length) * 100));
    }
  } catch (e) {
    return { error: e.message };
  }
  const size = photos.reduce((sum, f) => sum + f.size, 0);
  if (size > limit) return { error: `These photos total more than ${MAX_DOCUMENT_MB}MB. Upload fewer pages.` };
  const name = photos.length === 1 ? files[0].name : `${photos.length} photos (${files[0].name} to ${files[files.length - 1].name})`;
  return { doc: { kind: "images", name, size, files: photos } };
}

// Content checks (keywords, client name) only ever warn. Text layers are unreliable
// (odd spacing, poor OCR, unusual wording), the AI reads the whole document anyway and
// the user reviews every figure, so a false rejection costs more than a warning.
// Only files that cannot be processed at all are blocked (see inspectPdf, prepareDocument).
export function checkWarnings(problems, imagePages) {
  if (!imagePages) return [...problems];
  return [
    `${imagePages} page${imagePages === 1 ? " is a scanned image" : "s are scanned images"}. The AI will read ${imagePages === 1 ? "it" : "them"}, but automatic checks on scanned pages were skipped. Review extracted figures carefully.`,
    ...problems,
  ];
}

// PDF text arrives with irregular spacing (double spaces, non-breaking spaces, line
// breaks) and typographic apostrophes, so keywords are compared on a normalised
// form of both sides: "STATEMENT OF  FINANCIAL\u00a0POSITION" matches "statement of financial position".
export function matchText(s) {
  return String(s || "")
    .normalize("NFKC") // ligatures such as \ufb01 become plain letters
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc'`]/g, "")
    .replace(/[,;:]/g, " ")
    .replace(/\s+/g, " ");
}

// Number of keywords in list found in text
export function countKw(text, list) {
  const t = matchText(text);
  return list.filter((k) => t.includes(matchText(k))).length;
}

export function appendDocument(formData, field, doc) {
  doc.files.forEach((f) => formData.append(field, f, f.name));
}
