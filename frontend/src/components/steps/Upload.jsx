import { useState, useRef } from "react";
import { Upload as UploadIcon, CheckCircle, Loader, AlertTriangle, AlertCircle, X } from "lucide-react";
import { extractFigures } from "../../api/client.js";

const RATINGS = ["","AAA","AA+","AA","AA-","A+","A","A-","BBB+","BBB","BBB-","BB+","BB","BB-","B+","B","B-","CCC","CC","C","D"];

// ── Keyword lists ─────────────────────────────────────────
const FIN_KW = [
  "revenue","total assets","shareholders equity","profit","loss",
  "cash","liabilities","balance sheet","income statement",
  "financial statements","earnings","equity","borrowings",
  "depreciation","ebitda","turnover","comprehensive income",
];

const CP_REQUIRED_KW = [
  "commercial paper","tenor","discount rate","offer",
  "maturity","issuer","programme","implied yield",
  "offer open","offer close","funding date","subscription",
];

const CP_PROSPECTUS_KW = [
  "programme memorandum","information memorandum",
  "securities exchange commission","trust deed",
  "listing particulars","guarantee",
];

const UNAUDITED_KW = [
  "unaudited","management accounts","management report",
  "interim financial","half year report","half-year report",
  "quarterly report","unaudited interim",
];

const RAT_KW = [
  "credit rating","rating agency","rating assigned","rating action",
  "issuer rating","national scale","long-term rating","short-term rating",
  "rating rationale","rating outlook","agusto","gcr","datapro","fitch","moody",
];

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

async function extractText(file, maxPages = 15) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const n   = Math.min(pdf.numPages, maxPages);
  let text  = "";
  for (let i = 1; i <= n; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    text += content.items.map((s) => s.str).join(" ") + " ";
  }
  return { text, numPages: pdf.numPages };
}

// ── Helpers ───────────────────────────────────────────────
function tokenScore(name, text) {
  const tok  = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const aSet = new Set(tok(name));
  const bTok = tok(text);
  if (!aSet.size || !bTok.length) return 0;
  const matches = bTok.filter((t) => aSet.has(t)).length;
  return matches / aSet.size;
}

function countKw(text, list) {
  const lc = text.toLowerCase();
  return list.filter((k) => lc.includes(k.toLowerCase())).length;
}

function formatReviewDate(val) {
  if (!val) return "";
  const d = new Date(val + "T00:00:00"); // force local timezone
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" });
}

function maxOccurrences(text, list) {
  const lc = text.toLowerCase();
  return Math.max(0, ...list.map((k) => {
    const re = new RegExp(k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    return (lc.match(re) || []).length;
  }));
}

// ── Validation ────────────────────────────────────────────
async function runFinValidation(file, clientName) {
  let text = "", numPages = 0;
  try {
    ({ text, numPages } = await extractText(file, 15));
  } catch {
    return { ok: true, warnings: ["PDF could not be fully read (possibly encrypted). Accepted — verify all figures manually."] };
  }

  if (text.replace(/\s/g, "").length < 300) {
    return { ok: true, warnings: ["Scanned or image-based PDF detected. Text extraction was limited — review all figures carefully on the next screen."] };
  }

  if (countKw(text, FIN_KW) < 4) {
    return { ok: false, hard: "This does not appear to be a financial statement. Key financial terms were not found. Please upload the audited annual accounts." };
  }

  if (countKw(text, RAT_KW) >= 3 && countKw(text, FIN_KW) < 8) {
    return { ok: false, hard: "This looks like a credit rating report, not a financial statement. Please upload it in the Credit Rating PDF slot instead." };
  }

  if (clientName?.trim() && tokenScore(clientName, text.slice(0, 3000)) < 0.6) {
    return { ok: false, hard: `Company name mismatch — "${clientName}" was not found in this document. Please verify you have uploaded the correct financial statements.` };
  }

  const warnings = [];
  const lc = text.toLowerCase();

  if (UNAUDITED_KW.some((k) => lc.includes(k))) {
    warnings.push("This document may be unaudited or interim accounts. SmartRisk Credit requires audited annual financial statements.");
  }

  const years = (text.slice(0, 2000).match(/\b(20\d{2})\b/g) || []).map(Number);
  if (years.length) {
    const maxYear = Math.max(...years);
    if (new Date().getFullYear() - maxYear >= 2) {
      return { ok: "confirm", warnings, statementYear: maxYear };
    }
  }

  return { ok: true, warnings };
}

async function runRatValidation(file, clientName) {
  let text = "";
  try {
    ({ text } = await extractText(file, 10));
  } catch {
    return { ok: true, warnings: ["Rating PDF could not be fully read. Accepted — verify rating details manually."] };
  }

  if (text.replace(/\s/g, "").length < 300) {
    return { ok: true, warnings: ["Scanned or image-based rating PDF detected. Accepted — verify rating details manually."] };
  }

  if (countKw(text, RAT_KW) < 2) {
    return { ok: false, hard: "This does not appear to be a credit rating report. Key rating terms were not found. Please upload the rating certificate or report from Agusto & Co., GCR, DataPro, or similar." };
  }

  if (clientName?.trim() && tokenScore(clientName, text.slice(0, 3000)) < 0.6) {
    return { ok: false, hard: `Company name mismatch — "${clientName}" was not found in this rating report. Please verify you have uploaded the correct document.` };
  }

  const warnings = [];
  const DATE_PAT = `(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4})`;
  const expiryMatch = text.match(new RegExp(`(?:expir(?:y|es|ed)|valid until|valid through|valid for|review date)[^\\n]{0,60}${DATE_PAT}`, "i"));

  if (expiryMatch) {
    const expiry = new Date(expiryMatch[1]);
    if (!isNaN(expiry.getTime())) {
      const days = Math.round((expiry - new Date()) / 86400000);
      if (days < 0) {
        warnings.push(`This rating report has expired (expiry: ${expiryMatch[1]}). An updated report is recommended.`);
      } else if (days <= 180) {
        warnings.push(`This rating report expires in ${days} days (${expiryMatch[1]}). Verify this is acceptable for your investment horizon.`);
      }
    }
  } else {
    const years = (text.slice(0, 2000).match(/\b(20\d{2})\b/g) || []).map(Number);
    if (years.length) {
      const maxYear = Math.max(...years);
      if (new Date().getFullYear() - maxYear >= 2) {
        warnings.push(`Rating report is from ${maxYear}. No expiry date detected — verify this rating is still current.`);
      }
    }
  }

  return { ok: true, warnings };
}

async function runCPValidation(file, clientName) {
  let text = "", numPages = 0;
  try {
    ({ text, numPages } = await extractText(file, 10));
  } catch {
    return { ok: true, warnings: ["CP terms PDF could not be fully read. Accepted — verify extracted fields manually."] };
  }

  if (text.replace(/\s/g, "").length < 300) {
    return { ok: true, warnings: ["Scanned or image-based PDF detected. Terms accepted — verify all extracted fields carefully."] };
  }

  if (clientName?.trim() && tokenScore(clientName, text.slice(0, 3000)) < 0.6) {
    return { ok: false, hard: `Company name mismatch — "${clientName}" was not found in this CP terms document. Please verify you have uploaded the correct file.` };
  }

  if (countKw(text, CP_REQUIRED_KW) < 4) {
    return { ok: false, hard: "This does not appear to be an indicative terms email. Key CP terms (Discount Rate, Implied Yield, Offer Open/Close, etc.) were not found. Please upload the forwarded CP email PDF." };
  }

  if (countKw(text, CP_PROSPECTUS_KW) >= 3) {
    return { ok: false, hard: "This looks like a full Programme Memorandum or Information Memorandum, not an indicative terms email. Please upload the short forwarded email (typically 3–6 pages)." };
  }

  const warnings = [];
  if (numPages > 6) {
    warnings.push(`This document is ${numPages} pages long. Indicative terms emails are usually 3–6 pages — please verify all extracted fields.`);
  }

  return { ok: true, warnings };
}

// ── Styles ────────────────────────────────────────────────
const css = {
  card    : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
  title   : { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" },
  grid    : { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 },
  label   : { fontSize:12, color:"#5A5A5A", display:"block", marginBottom:4 },
  input   : { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, background:"#fff", color:"#1F2854", fontFamily:"Arial,sans-serif", boxSizing:"border-box" },
  select  : { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, background:"#fff", color:"#1F2854", fontFamily:"Arial,sans-serif" },
  zone    : (hover) => ({ border:`2px dashed ${hover ? "var(--accent)" : "#D0D0D0"}`, borderRadius:8, padding:"36px 16px", textAlign:"center", cursor:"pointer", background: hover ? "#F8F8F5" : "transparent", transition:"all 0.15s" }),
  done    : { padding:"10px 14px", borderRadius:6, fontSize:13, background:"#EAF3DE", color:"#27500A", border:"1px solid #97C459", display:"flex", alignItems:"center", justifyContent:"space-between" },
  actions : { display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 },
  btn     : { padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #1F2854", background:"#1F2854", color:"#fff", fontFamily:"Arial,sans-serif" },
  btnDis  : { padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"not-allowed", border:"1px solid #D0D0D0", background:"#D0D0D0", color:"#fff", fontFamily:"Arial,sans-serif" },
};

// ── Sub-components ────────────────────────────────────────
function UploadZone({ label, sub, file, onFile, onClear, validating, onGuard }) {
  const [hover, setHover] = useState(false);
  const ref = useRef();

  if (validating) return (
    <div style={{ padding:"12px 14px", borderRadius:6, fontSize:13, background:"#F0F4FF", color:"#1A5276", border:"1px solid #9DBFEA", display:"flex", alignItems:"center", gap:8 }}>
      <Loader size={14} style={{ animation:"spin 0.8s linear infinite", flexShrink:0 }} />
      Validating document…
    </div>
  );

  if (file) return (
    <div style={css.done}>
      <span><CheckCircle size={14} style={{ marginRight:6, verticalAlign:"middle" }} />{file.name}</span>
      <button onClick={onClear} style={{ background:"none", border:"none", cursor:"pointer", color:"#27500A", fontSize:18, lineHeight:1 }}>&times;</button>
    </div>
  );

  return (
    <>
      <input ref={ref} type="file" accept=".pdf" style={{ display:"none" }}
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      <div style={css.zone(hover)}
        onClick={() => { if (onGuard?.()) return; ref.current.click(); }}
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => { e.preventDefault(); setHover(false); if (onGuard?.()) return; const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") onFile(f); }}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      >
        <UploadIcon size={36} style={{ margin:"0 auto 12px", opacity:0.35, display:"block" }} />
        <div style={{ fontSize:14, fontWeight:"bold", color:"#1F2854", marginBottom:4 }}>{label}</div>
        <div style={{ fontSize:12, color:"#888" }}>{sub}</div>
      </div>
    </>
  );
}

function ValidationError({ msg, onClear }) {
  return (
    <div style={{ marginTop:8, padding:"10px 12px", borderRadius:6, background:"#FCEBEB", border:"1px solid #F09595", fontSize:12, color:"#791F1F", display:"flex", gap:8, alignItems:"flex-start" }}>
      <AlertCircle size={14} style={{ flexShrink:0, marginTop:1 }} />
      <span style={{ flex:1 }}>{msg}</span>
      {onClear && <button onClick={onClear} style={{ background:"none", border:"none", cursor:"pointer", color:"#791F1F", padding:0, flexShrink:0 }}><X size={13} /></button>}
    </div>
  );
}

function ValidationWarnings({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
      {warnings.map((w, i) => (
        <div key={i} style={{ padding:"8px 12px", borderRadius:6, background:"#FEF6E7", border:"1px solid #F0C060", fontSize:12, color:"#7A4F00", display:"flex", gap:8, alignItems:"flex-start" }}>
          <AlertTriangle size={13} style={{ flexShrink:0, marginTop:1 }} />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

function InfoModal({ onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:10, padding:"28px 32px", maxWidth:420, width:"100%", boxShadow:"0 16px 60px rgba(0,0,0,0.2)", textAlign:"center" }}>
        <div style={{ width:40, height:40, borderRadius:"50%", border:"2px solid #1F2854", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:18, fontWeight:"bold", color:"#1F2854" }}>i</div>
        <div style={{ fontSize:15, fontWeight:"bold", color:"#1F2854", marginBottom:10 }}>Client name required</div>
        <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.7, marginBottom:24 }}>
          Please enter the client name in the field above before uploading the financial statement. The name is used to verify the document belongs to the correct company.
        </p>
        <button onClick={onClose} style={{ padding:"9px 28px", fontSize:13, borderRadius:6, cursor:"pointer", border:"none", background:"#1F2854", color:"#fff", fontFamily:"Arial,sans-serif", fontWeight:600 }}>
          OK, got it
        </button>
      </div>
    </div>
  );
}

function ConfirmModal({ year, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:10, padding:"28px 32px", maxWidth:420, width:"100%", boxShadow:"0 16px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <AlertTriangle size={22} color="#d4820a" />
          <div style={{ fontSize:15, fontWeight:"bold", color:"#1F2854" }}>Older Financial Statement</div>
        </div>
        <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.7, marginBottom:20 }}>
          This document appears to be from <strong>{year}</strong>, which is {new Date().getFullYear() - year} year{new Date().getFullYear() - year !== 1 ? "s" : ""} old.
          SmartRisk Credit recommends the most recent audited annual statements.
          Do you want to continue with this document?
        </p>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onCancel}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#5A5A5A", fontFamily:"Arial,sans-serif" }}>
            Cancel upload
          </button>
          <button onClick={onConfirm}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"none", background:"var(--primary)", color:"#fff", fontFamily:"Arial,sans-serif", fontWeight:600 }}>
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────
const BLANK = { validating: false, warnings: [], error: "" };

export default function Upload({ clientInfo, onClientInfoChange, onExtractStart }) {
  const [finFile, setFinFile] = useState(null);
  const [ratFile, setRatFile] = useState(null);
  const [cpFile,  setCpFile]  = useState(null);

  const [finV, setFinV] = useState(BLANK);
  const [ratV, setRatV] = useState(BLANK);
  const [cpV,  setCpV]  = useState(BLANK);

  const [confirm,   setConfirm]   = useState(null);
  const [showModal, setShowModal] = useState(false);
  const nameGuard = () => { if (!info.clientName?.trim()) { setShowModal(true); return true; } return false; };
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const info = clientInfo;
  const set  = (k, v) => onClientInfoChange({ ...info, [k]: v });

  // ── File handlers ───────────────────────────────────────
  async function handleFinFile(file) {
    setFinFile(file);
    setFinV({ validating: true, warnings: [], error: "" });
    const result = await runFinValidation(file, info.clientName);

    if (result.ok === false) {
      setFinFile(null);
      setFinV({ validating: false, warnings: [], error: result.hard });
      return;
    }
    if (result.ok === "confirm") {
      setConfirm({ year: result.statementYear, file, warnings: result.warnings });
      setFinV({ validating: false, warnings: [], error: "" });
      return;
    }
    setFinV({ validating: false, warnings: result.warnings, error: "" });
  }

  function handleConfirm() {
    setFinFile(confirm.file);
    setFinV({ validating: false, warnings: [...(confirm.warnings || []), `Statement year ${confirm.year} accepted.`], error: "" });
    setConfirm(null);
  }

  function handleCancelConfirm() {
    setFinFile(null);
    setFinV(BLANK);
    setConfirm(null);
  }

  async function handleRatFile(file) {
    setRatFile(file);
    setRatV({ validating: true, warnings: [], error: "" });
    const result = await runRatValidation(file, info.clientName);

    if (result.ok === false) {
      setRatFile(null);
      setRatV({ validating: false, warnings: [], error: result.hard });
      return;
    }
    setRatV({ validating: false, warnings: result.warnings, error: "" });
  }

  async function handleCpFile(file) {
    setCpFile(file);
    setCpV({ validating: true, warnings: [], error: "" });
    const result = await runCPValidation(file, info.clientName);

    if (result.ok === false) {
      setCpFile(null);
      setCpV({ validating: false, warnings: [], error: result.hard });
      return;
    }
    setCpV({ validating: false, warnings: result.warnings, error: "" });
  }

  // ── Extract ─────────────────────────────────────────────
  async function handleExtract() {
    if (!info.clientName?.trim()) { setError("Client name is required."); return; }
    if (!finFile)                  { setError("Please upload the financial statement PDF."); return; }
    setError("");
    setLoading(true);

    const fd = new FormData();
    fd.append("financial_pdf", finFile);
    if (ratFile) fd.append("rating_pdf", ratFile);
    if (cpFile)  fd.append("cp_terms_pdf", cpFile);

    const promise = extractFigures(fd)
      .then((res) => {
        const data = res.data;
        if (data.ratingData) {
          onClientInfoChange({
            ...info,
            extractedRating : data.ratingData,
            creditRating    : data.ratingData.longTermRating || info.creditRating,
          });
        }
        return data.figures;
      })
      .finally(() => setLoading(false));

    onExtractStart({
      ...info,
      reviewDate: formatReviewDate(info.reviewDate) || new Date().toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" }),
    }, promise);
  }

  const anyValidating = finV.validating || ratV.validating || cpV.validating;
  const canExtract    = !!finFile && !!info.clientName?.trim() && !loading && !anyValidating;

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {showModal && <InfoModal onClose={() => setShowModal(false)} />}
      {error && (
        <div style={{ padding:"10px 14px", borderRadius:6, fontSize:13, background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", marginBottom:12 }}>
          {error}
        </div>
      )}

      {/* Client info */}
      <div style={css.card}>
        <div style={css.title}>Client Information</div>
        <div style={css.grid}>
          <div style={{ gridColumn:"span 2" }}>
            <label style={css.label}>Client name *</label>
            <input style={css.input} type="text" placeholder="e.g. Flour Mills of Nigeria Plc"
              value={info.clientName || ""} onChange={(e) => set("clientName", e.target.value)} />
          </div>
          <div>
            <label style={css.label}>Credit rating (external)</label>
            <select style={css.select} value={info.creditRating || ""} onChange={(e) => set("creditRating", e.target.value)}>
              {RATINGS.map((r) => <option key={r} value={r}>{r || "Select rating"}</option>)}
            </select>
          </div>
          <div>
            <label style={css.label}>Review date</label>
            <input style={css.input} type="date"
              value={info.reviewDate || ""} onChange={(e) => set("reviewDate", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Financial statement */}
      <div style={css.card}>
        <div style={css.title}>Financial Statement PDF</div>
        <UploadZone
          label="Click to upload financial statement"
          sub="Balance sheet + income statement — PDF only"
          file={finFile}
          onFile={handleFinFile}
          onClear={() => { setFinFile(null); setFinV(BLANK); }}
          validating={finV.validating}
          onGuard={nameGuard}
        />
        {finV.error    && <ValidationError msg={finV.error} onClear={() => setFinV(BLANK)} />}
        {!finV.error   && <ValidationWarnings warnings={finV.warnings} />}
      </div>

      {/* Credit rating */}
      <div style={css.card}>
        <div style={css.title}>Credit Rating PDF <span style={{ fontWeight:"normal", fontSize:11, color:"#888" }}>(optional)</span></div>
        <UploadZone
          label="Click to upload credit rating report"
          sub="DataPro, Agusto & Co, or similar — PDF only"
          file={ratFile}
          onFile={handleRatFile}
          onClear={() => { setRatFile(null); setRatV(BLANK); }}
          validating={ratV.validating}
          onGuard={nameGuard}
        />
        {ratV.error    && <ValidationError msg={ratV.error} onClear={() => setRatV(BLANK)} />}
        {!ratV.error   && <ValidationWarnings warnings={ratV.warnings} />}
      </div>

      {/* CP indicative terms */}
      <div style={css.card}>
        <div style={css.title}>CP Indicative Terms <span style={{ fontWeight:"normal", fontSize:11, color:"#888" }}>(optional)</span></div>
        <UploadZone
          label="Click to upload indicative terms email"
          sub="Forwarded CP email PDF, max 6 pages — AI extracts all terms"
          file={cpFile}
          onFile={handleCpFile}
          onClear={() => { setCpFile(null); setCpV(BLANK); }}
          validating={cpV.validating}
          onGuard={nameGuard}
        />
        {cpV.error    && <ValidationError msg={cpV.error} onClear={() => setCpV(BLANK)} />}
        {!cpV.error   && <ValidationWarnings warnings={cpV.warnings} />}
      </div>

      <div style={css.actions}>
        <button style={canExtract ? css.btn : css.btnDis} disabled={!canExtract} onClick={handleExtract}>
          {loading
            ? <><Loader size={14} style={{ verticalAlign:"middle", marginRight:6, animation:"spin 0.8s linear infinite" }} />Extracting...</>
            : anyValidating ? "Validating…" : "Extract with AI"}
        </button>
      </div>

      {confirm && (
        <ConfirmModal
          year={confirm.year}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      )}
    </div>
  );
}