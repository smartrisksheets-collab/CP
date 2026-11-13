// Shared handling for uploaded documents: one PDF per slot (D046). Scanned PDFs work;
// photos are not accepted.
// The backend re-checks everything; these checks give the user a fast, clear answer first.

export const ACCEPT = ".pdf,application/pdf";
export const MAX_DOCUMENT_MB = 20;   // matches backend/api/documents.py
const MAX_PDF_PAGES  = 600;          // Claude's page limit per request for this model
const MIN_PAGE_TEXT  = 50;           // characters below which a page may be a scan

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
      return { error: "This PDF is password-protected. Save an unlocked copy and try again." };
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
function isPdf(file) {
  return (file.type || "").toLowerCase() === "application/pdf" || (file.name || "").toLowerCase().endsWith(".pdf");
}

// Turns a FileList into a document: { kind: "pdf", name, size, files: [file] }.
// Returns { error } when the selection can never be uploaded.
export async function prepareDocument(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return { error: "No file was selected." };
  if (files.length > 1) return { error: "Upload one PDF per document." };
  const [file] = files;
  if (!isPdf(file)) return { error: "Only PDF files are accepted. Scan or save the document as a PDF and upload again." };
  if (!file.size) return { error: "This file is empty." };
  if (file.size > MAX_DOCUMENT_MB * 1024 * 1024) {
    return { error: `This PDF is larger than ${MAX_DOCUMENT_MB}MB. Compress it or upload only the statements section.` };
  }
  return { doc: { kind: "pdf", name: file.name, size: file.size, files: [file] } };
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
