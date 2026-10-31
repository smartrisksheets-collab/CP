import { useState, useRef, useEffect } from "react";
import { Upload as UploadIcon, CheckCircle, Loader, AlertTriangle, AlertCircle, X, ChevronRight } from "lucide-react";
import { useIsMobile } from "../../hooks/useBreakpoint.js";
import { extractFigures, errorMessage } from "../../api/client.js";
import CPTerms from "./CPTerms.jsx";
import { ACCEPT, PHOTO_WARNING, inspectPdf, prepareDocument, checkWarnings, appendDocument, countKw } from "../../utils/documentInput.js";

const RATINGS = ["","AAA","AA+","AA","AA-","A+","A","A-", "A1+", "A1", "A2", "A3", "BBB+","BBB","BBB-","BB+","BB","BB-","B+","B","B-","CCC","CC","C","D"];

const EXTRACT_MESSAGES = [
  "Sending to extraction engine…",
  "Reading financial statements…",
  "Extracting income statement figures…",
  "Extracting balance sheet figures…",
  "Checking standalone vs group figures…",
  "Computing EBITDA…",
  "Finalising extraction…",
];

// ── Keyword lists ─────────────────────────────────────────
const FIN_KW = [
  "revenue","total assets","shareholders equity","profit","loss",
  "cash","liabilities","balance sheet","income statement",
  "financial statements","earnings","equity","borrowings",
  "depreciation","ebitda","turnover","comprehensive income",
  "naira","n'000","ngn","ifrs","independent auditor",
];

const UNAUDITED_KW = [
  "unaudited","management accounts",
  "interim financial","half year report","half-year report",
  "quarterly report","unaudited interim",
];

const RAT_KW = [
  "credit rating","rating agency","rating assigned","rating action",
  "issuer rating","national scale","long-term rating","short-term rating",
  "rating rationale","rating outlook","agusto","gcr","datapro","fitch","moody",
];

// C — Dual-section constants
const BS_KW = [
  "total assets","current assets","non-current assets","statement of financial position",
  "balance sheet","shareholders equity","total equity","total liabilities",
  "property plant and equipment",
];
const IS_KW = [
  "revenue","turnover","profit","loss","income statement",
  "statement of comprehensive income","statement of profit or loss",
  "gross profit","operating profit","profit before tax","profit after tax",
  "earnings","comprehensive income",
];

// ── Helpers ───────────────────────────────────────────────
function tokenScore(name, text) {
  const STOP = new Set(["of","the","and","for","in","a","an","plc","ltd","limited","co","company","nigeria","nig","group","holdings","international"]);
  const tok  = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const meaningful = tok(name).filter(t => !STOP.has(t) && t.length > 1);
  if (!meaningful.length) return 1; // all stopwords — skip check
  const aSet = new Set(meaningful);
  const bTok = tok(text);
  const matches = bTok.filter(t => aSet.has(t)).length;
  return matches / aSet.size;
}


function formatReviewDate(val) {
  if (!val) return "";
  const d = new Date(val + "T00:00:00"); // force local timezone
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" });
}

// ── Validation ────────────────────────────────────────────
const FIN_PAGES_CHECKED = 100; // statements often sit after page 15 of an annual report

async function runFinValidation(doc, clientName) {
  if (doc.kind === "images") return { ok: true, warnings: [PHOTO_WARNING] };

  let info;
  try {
    info = await inspectPdf(doc.files[0], FIN_PAGES_CHECKED);
  } catch {
    return { ok: true, warnings: ["PDF could not be checked in the browser. Accepted — verify all figures manually."] };
  }
  if (info.error) return { ok: false, hard: info.error };
  const { text } = info;

  if (text.replace(/\s/g, "").length < 300) {
    return { ok: true, warnings: ["Scanned or image-based PDF detected. Text extraction was limited — review all figures carefully on the next screen."] };
  }

  const problems = [];

  // C — Require both balance sheet AND income statement evidence
  const hasBS = countKw(text, BS_KW) > 0;
  const hasIS = countKw(text, IS_KW) > 0;
  if (!hasBS || !hasIS) {
    const missing = !hasBS ? "Balance Sheet" : "Income Statement";
    problems.push(`This document does not appear to contain a ${missing}. Please upload complete audited annual financial statements including both sections.`);
  }

  if (countKw(text, FIN_KW) < 3) {
    problems.push("This does not appear to be a financial statement. Key financial terms were not found. Please upload the audited annual accounts.");
  }

  if (countKw(text, RAT_KW) >= 3 && countKw(text, FIN_KW) < 8) {
    problems.push("This looks like a credit rating report, not a financial statement. Please upload it in the Credit Rating slot instead.");
  }

  if (clientName?.trim() && tokenScore(clientName, text.slice(0, 5000)) < 0.5) {
    problems.push(`Company name mismatch — "${clientName}" was not found in this document. Please verify you have uploaded the correct financial statements.`);
  }

  const warnings = checkWarnings(problems, info.imagePages);

  // B — Numeric density check
  const nonSpace = text.replace(/\s/g, "");
  if ((text.match(/\d/g) || []).length / (nonSpace.length || 1) < 0.02) {
    warnings.push("Very few numbers were detected in this document. Verify this is a complete financial statement containing figures.");
  }

  if (countKw(text, UNAUDITED_KW) > 0) {
    warnings.push("This document may be unaudited or interim accounts. SmartRisk Credit requires audited annual financial statements.");
  }

  // D — Full document year scan
  const years = (text.match(/\b(20\d{2})\b/g) || []).map(Number);
  if (years.length) {
    const maxYear = Math.max(...years);
    if (new Date().getFullYear() - maxYear >= 2) {
      return { ok: "confirm", warnings, statementYear: maxYear };
    }
  }

  return { ok: true, warnings };
}

async function runRatValidation(doc, clientName) {
  if (doc.kind === "images") return { ok: true, warnings: [PHOTO_WARNING] };

  let info;
  try {
    info = await inspectPdf(doc.files[0], 10);
  } catch {
    return { ok: true, warnings: ["Rating PDF could not be checked in the browser. Accepted — verify rating details manually."] };
  }
  if (info.error) return { ok: false, hard: info.error };
  const { text } = info;

  if (text.replace(/\s/g, "").length < 300) {
    return { ok: true, warnings: ["Scanned or image-based rating PDF detected. Accepted — verify rating details manually."] };
  }

  const problems = [];
  if (countKw(text, RAT_KW) < 2) {
    problems.push("This does not appear to be a credit rating report. Key rating terms were not found. Please upload the rating certificate or report from Agusto & Co., GCR, DataPro, or similar.");
  }

  if (clientName?.trim() && tokenScore(clientName, text.slice(0, 5000)) < 0.5) {
    problems.push(`Company name mismatch — "${clientName}" was not found in this rating report. Please verify you have uploaded the correct document.`);
  }

  const warnings = checkWarnings(problems, info.imagePages);

  // F — Rating symbol detection
  if (!/\b(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC|SD|D)\b/.test(text)) {
    warnings.push("No rating grade symbols (e.g. AA+, BBB-) were detected. Verify this document contains an explicit rating assignment.");
  }

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
    const years = (text.match(/\b(20\d{2})\b/g) || []).map(Number);
    if (years.length) {
      const maxYear = Math.max(...years);
      if (new Date().getFullYear() - maxYear >= 2) {
        warnings.push(`Rating report is from ${maxYear}. No expiry date detected — verify this rating is still current.`);
      }
    }
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
  select  : { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, background:"#fff", color:"#1F2854", fontFamily:"Arial,sans-serif", boxSizing:"border-box" },
  zone    : (hover) => ({ border:`2px dashed ${hover ? "var(--accent)" : "#D0D0D0"}`, borderRadius:8, padding:"36px 16px", textAlign:"center", cursor:"pointer", background: hover ? "#F8F8F5" : "transparent", transition:"all 0.15s" }),
  done    : { padding:"10px 14px", borderRadius:6, fontSize:13, background:"#EAF3DE", color:"#27500A", border:"1px solid #97C459", display:"flex", alignItems:"center", justifyContent:"space-between" },
  actions : { display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 },
  btn     : { padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #1F2854", background:"#1F2854", color:"#fff", fontFamily:"Arial,sans-serif" },
  btnDis  : { padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"not-allowed", border:"1px solid #D0D0D0", background:"#D0D0D0", color:"#fff", fontFamily:"Arial,sans-serif" },
};

// ── Sub-components ────────────────────────────────────────
function UploadZone({ label, sub, file, onFile, onClear, validating, onGuard, progress }) {
  const [hover, setHover] = useState(false);
  const ref = useRef();

  if (progress?.show) return (
    <div style={{ padding:"12px 14px", borderRadius:6, background:"#F8F8F8", border:"1px solid #E0E0E0" }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#5A5A5A", marginBottom:4 }}>
        <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"75%" }}>{progress.name}</span>
        <span>{progress.pct}%</span>
      </div>
      <div style={{ height:4, background:"#E8E8E8", borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:"100%", background:"#01b88e", width:`${progress.pct}%`, transition:"width 0.2s ease", borderRadius:2 }} />
      </div>
      <div style={{ fontSize:12, color:"#888", marginTop:4 }}>Reading file…</div>
    </div>
  );

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
      <input ref={ref} type="file" accept={ACCEPT} multiple style={{ display:"none" }}
        onChange={(e) => { if (e.target.files.length) onFile(Array.from(e.target.files)); e.target.value = ""; }} />
      <div style={css.zone(hover)}
        onClick={() => { if (onGuard?.()) return; ref.current.click(); }}
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => { e.preventDefault(); setHover(false); if (onGuard?.()) return; if (e.dataTransfer.files.length) onFile(Array.from(e.dataTransfer.files)); }}
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
      <div className="sr-modal-inner" style={{ background:"#fff", borderRadius:10, padding:"28px 32px", maxWidth:420, width:"100%", boxShadow:"0 16px 60px rgba(0,0,0,0.2)", textAlign:"center" }}>
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
      <div className="sr-modal-inner" style={{ background:"#fff", borderRadius:10, padding:"28px 32px", maxWidth:420, width:"100%", boxShadow:"0 16px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <AlertTriangle size={22} color="#d4820a" />
          <div style={{ fontSize:15, fontWeight:"bold", color:"#1F2854" }}>Older Financial Statement</div>
        </div>
        <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.7, marginBottom:20 }}>
          This document appears to be from <strong>{year}</strong>, which is {new Date().getFullYear() - year} year{new Date().getFullYear() - year !== 1 ? "s" : ""} old.
          SmartRisk Credit recommends the most recent audited annual statements.
          Do you want to continue with this document?
        </p>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
          <button onClick={onCancel}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#5A5A5A", fontFamily:"Arial,sans-serif", flex:"1 1 auto" }}>
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

function ReExtractModal({ type, onConfirm, onCancel }) {
  const isDeduction = type === "deduction";
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div className="sr-modal-inner" style={{ background:"#fff", borderRadius:10, padding:"28px 32px", maxWidth:440, width:"100%", boxShadow:"0 16px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <AlertTriangle size={22} color={isDeduction ? "#A32D2D" : "#d4820a"} />
          <div style={{ fontSize:15, fontWeight:"bold", color:"#1F2854" }}>
            {isDeduction ? "Additional Credit Required" : "Re-extraction Warning"}
          </div>
        </div>
        <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.75, marginBottom:20 }}>
          {isDeduction
            ? "You have already extracted this document twice. Proceeding will deduct 1 credit from your balance. Please verify your uploaded document is correct before continuing."
            : "You have already extracted this document once. Re-extracting will overwrite your previous results. This one re-extraction is free — verify your document before proceeding."}
        </p>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
          <button onClick={onCancel}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#5A5A5A", fontFamily:"Arial,sans-serif", flex:"1 1 auto" }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"none", background: isDeduction ? "#A32D2D" : "var(--primary)", color:"#fff", fontFamily:"Arial,sans-serif", fontWeight:600 }}>
            {isDeduction ? "Proceed & Deduct Credit" : "Re-extract"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewAssessmentModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div className="sr-modal-inner" style={{ background:"#fff", borderRadius:10, padding:"28px 32px", maxWidth:440, width:"100%", boxShadow:"0 16px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <AlertTriangle size={22} color="#A32D2D" />
          <div style={{ fontSize:15, fontWeight:"bold", color:"#1F2854" }}>Start New Assessment?</div>
        </div>
        <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.75, marginBottom:20 }}>
          You have an assessment in progress. Uploading a new document will clear all computed scores and analysis.
          <br /><br />
          <strong>Make sure you have downloaded your report before continuing.</strong> Your client details will be preserved.
        </p>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap" }}>
          <button onClick={onCancel}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#5A5A5A", fontFamily:"Arial,sans-serif", flex:"1 1 auto" }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"none", background:"#A32D2D", color:"#fff", fontFamily:"Arial,sans-serif", fontWeight:600 }}>
            Clear & Upload New
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────
const BLANK = { validating: false, warnings: [], error: "" };
const BLANK_PROG = { show: false, pct: 0, name: "" };

export default function Upload({ clientInfo, onClientInfoChange, onExtracted, onQuotaError, figures, onFiguresChange, onContinue, draftId, hasDownstreamData, onNewAssessment }) {
  const [finDoc, setFinDoc] = useState(null);
  const [ratDoc, setRatDoc] = useState(null);

  const [finV, setFinV] = useState(BLANK);
  const [ratV, setRatV] = useState(BLANK);
  const [finProgress, setFinProgress] = useState(BLANK_PROG);
  const [ratProgress, setRatProgress] = useState(BLANK_PROG);

  const [confirm,   setConfirm]   = useState(null);
  const [showModal, setShowModal] = useState(false);
  const nameGuard = () => { if (!info.clientName?.trim()) { setShowModal(true); return true; } return false; };
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [msgIdx,     setMsgIdx]     = useState(0);
  const [uploadPct,  setUploadPct]  = useState(0);
  const [subStep,  setSubStep]  = useState(() => {
    try { return parseInt(sessionStorage.getItem("sr_uploadSubStep") || "0"); } catch { return 0; }
  });
  const [extractionCount,  setExtractionCount]  = useState(() => {
    try { return parseInt(sessionStorage.getItem("sr_extractionCount") || "0"); } catch { return 0; }
  });
  const [extractedFileKey, setExtractedFileKey] = useState(() => {
    try { return sessionStorage.getItem("sr_extractedFileKey") || ""; } catch { return ""; }
  });
  const [reExtractModal,    setReExtractModal]    = useState(null); // null | "warning" | "deduction"
  const [newAssessModal,    setNewAssessModal]     = useState(null);
  const [showExtractConfirm, setShowExtractConfirm] = useState(false);

  const isMobile = useIsMobile();
  const info = clientInfo;
  const set  = (k, v) => onClientInfoChange({ ...info, [k]: v });
  const showRatingReminder = !!ratDoc && !info.creditRating;

  function goToSubStep(n) {
    setSubStep(n);
    try { sessionStorage.setItem("sr_uploadSubStep", String(n)); } catch { /* storage blocked; in-memory state still works */ }
  }

  useEffect(() => {
    if (!loading) return; // doExtract resets msgIdx before loading starts
    const t = setInterval(() => setMsgIdx(i => Math.min(i + 1, EXTRACT_MESSAGES.length - 1)), 8000);
    return () => clearInterval(t);
  }, [loading]);

  
  const currentFileKey = finDoc ? `${finDoc.name}-${finDoc.size}` : "";
  const fileChanged    = !!extractedFileKey && !!currentFileKey && currentFileKey !== extractedFileKey;

  // ── File handlers ───────────────────────────────────────
  // Turns picked files into a document, showing progress while photos are prepared
  async function loadDocument(files, setProgress, setV) {
    const name = files.length === 1 ? files[0].name : `${files.length} files`;
    setV(BLANK);
    setProgress({ show: true, pct: 0, name });
    const { doc, error } = await prepareDocument(files, (pct) => setProgress({ show: true, pct, name }));
    setProgress(BLANK_PROG);
    if (error) setV({ validating: false, warnings: [], error });
    return doc;
  }

  async function _processFinFiles(files) {
    setFinDoc(null);
    const doc = await loadDocument(files, setFinProgress, setFinV);
    if (!doc) return;
    setFinV({ validating: true, warnings: [], error: "" });
    const result = await runFinValidation(doc, info.clientName);
    if (result.ok === false) {
      setFinV({ validating: false, warnings: [], error: result.hard });
      return;
    }
    if (result.ok === "confirm") {
      setConfirm({ year: result.statementYear, doc, warnings: result.warnings });
      setFinV({ validating: false, warnings: [], error: "" });
      return;
    }
    setFinDoc(doc);
    setFinV({ validating: false, warnings: result.warnings, error: "" });
  }

  async function handleFinFiles(files) {
    if (hasDownstreamData) {
      setNewAssessModal({ pendingFiles: files });
      return;
    }
    await _processFinFiles(files);
  }

  function handleNewAssessConfirm() {
    const files = newAssessModal.pendingFiles;
    setNewAssessModal(null);
    setExtractionCount(0);
    setExtractedFileKey("");
    onNewAssessment?.();
    _processFinFiles(files);
  }

  function handleConfirm() {
    setFinDoc(confirm.doc);
    setFinV({ validating: false, warnings: [...(confirm.warnings || []), `Statement year ${confirm.year} accepted.`], error: "" });
    setConfirm(null);
  }

  function handleCancelConfirm() {
    setFinDoc(null);
    setFinV(BLANK);
    setConfirm(null);
  }

  async function handleRatFiles(files) {
    setRatDoc(null);
    const doc = await loadDocument(files, setRatProgress, setRatV);
    if (!doc) return;
    setRatV({ validating: true, warnings: [], error: "" });
    const result = await runRatValidation(doc, info.clientName);
    if (result.ok === false) {
      setRatV({ validating: false, warnings: [], error: result.hard });
      return;
    }
    setRatDoc(doc);
    setRatV({ validating: false, warnings: result.warnings, error: "" });
  }


  // ── Extract ─────────────────────────────────────────────
  async function doExtract() {
    setError("");
    setLoading(true);
    setMsgIdx(0);
    setUploadPct(0);
    const fd = new FormData();
    appendDocument(fd, "financial_pdf", finDoc);
    if (ratDoc)          appendDocument(fd, "rating_pdf", ratDoc);
    if (info.clientName) fd.append("client_name", info.clientName);
    if (draftId)         fd.append("draft_id",    String(draftId));
    try {
      const res  = await extractFigures(fd, (e) => {
        if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
      });
      const data = res.data;
      const updatedInfo = {
        ...info,
        reviewDate: formatReviewDate(info.reviewDate) || new Date().toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" }),
      };
      if (data.ratingData) {
        updatedInfo.extractedRating = data.ratingData;
        updatedInfo.creditRating    = data.ratingData.longTermRating || info.creditRating;
      }
      if (data.cpTerms) updatedInfo.cpTerms = data.cpTerms;
      onClientInfoChange(updatedInfo);
      onExtracted(data.figures, updatedInfo, data.draftId || null);
      const newCount = extractionCount + 1;
      const fileKey  = `${finDoc.name}-${finDoc.size}`;
      setExtractionCount(newCount);
      setExtractedFileKey(fileKey);
      try {
        sessionStorage.setItem("sr_extractionCount", String(newCount));
        sessionStorage.setItem("sr_extractedFileKey", fileKey);
      } catch { /* storage blocked; in-memory state still works */ }
      goToSubStep(1);
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail?.quotaExceeded) {
        onQuotaError(errorMessage(e, "You have 0 credits remaining."));
      } else {
        setError(errorMessage(e, "Extraction failed. Please try again."));
      }
    } finally {
      setLoading(false);
      setUploadPct(0);
    }
  }

  function handleExtract() {
    if (!info.clientName?.trim()) { setError("Client name is required."); return; }
    if (!finDoc)                  { setError("Please upload the financial statement."); return; }
    if (ratDoc && !info.creditRating) {
      setError("You uploaded a credit rating report — please select the rating from the dropdown before extracting.");
      return;
    }
    if (extractionCount === 1)     { setReExtractModal("warning");   return; }
    if (extractionCount >= 2)      { setReExtractModal("deduction"); return; }
    setShowExtractConfirm(true);
  }

  const anyValidating = finV.validating || ratV.validating;
  const hasExtracted  = extractionCount > 0;
  const canGoNext     = hasExtracted && !fileChanged;
  const canExtract    = !!finDoc && !!info.clientName?.trim() && !loading && !anyValidating && (!hasExtracted || fileChanged);
  const progressPct   = loading
    ? uploadPct < 100
      ? uploadPct                                                          // real upload progress
      : 99                                                                 // hold at 99 while Claude works
    : 0;

  if (subStep === 1) {
    return (
      <CPTerms
        figures={figures}
        onFiguresChange={onFiguresChange}
        onBack={() => goToSubStep(0)}
        onNext={onContinue}
        clientName={info.clientName}
      />
    );
  }

  return (
    <div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
          .sr-modal-inner { padding: 20px 16px !important; }
        }
      `}</style>

      {showModal && <InfoModal onClose={() => setShowModal(false)} />}
      {error && (
        <div style={{ padding:"10px 14px", borderRadius:6, fontSize:13, background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", marginBottom:12 }}>
          {error}
        </div>
      )}

      {/* Client info */}
      <div style={css.card}>
        <div style={css.title}>Client Information</div>
        <div style={{ ...css.grid, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(200px,1fr))" }}>
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
        <div style={css.title}>Financial Statement</div>
        <UploadZone
          label="Click to upload financial statement"
          sub="Balance sheet + income statement — one PDF, or photos of the pages"
          file={finDoc}
          onFile={handleFinFiles}
          onClear={() => { setFinDoc(null); setFinV(BLANK); setFinProgress(BLANK_PROG); }}
          validating={finV.validating}
          onGuard={nameGuard}
          progress={finProgress}
        />
        {finV.error    && <ValidationError msg={finV.error} onClear={() => setFinV(BLANK)} />}
        {!finV.error   && <ValidationWarnings warnings={finV.warnings} />}
      </div>

      {/* Credit rating */}
      <div style={css.card}>
        <div style={css.title}>Credit Rating <span style={{ fontWeight:"normal", fontSize:11, color:"#888" }}>(optional)</span></div>
        <UploadZone
          label="Click to upload credit rating report"
          sub="DataPro, Agusto & Co, or similar — one PDF, or photos of the pages"
          file={ratDoc}
          onFile={handleRatFiles}
          onClear={() => { setRatDoc(null); setRatV(BLANK); setRatProgress(BLANK_PROG); }}
          validating={ratV.validating}
          onGuard={nameGuard}
          progress={ratProgress}
        />
        {ratV.error    && <ValidationError msg={ratV.error} onClear={() => setRatV(BLANK)} />}
        {!ratV.error   && <ValidationWarnings warnings={ratV.warnings} />}
        {showRatingReminder && (
          <div style={{ marginTop:10, padding:"8px 12px", borderRadius:6, background:"#FEF6E7", border:"1px solid #F0C060", fontSize:12, color:"#7A4F00", display:"flex", gap:8, alignItems:"flex-start" }}>
            <AlertTriangle size={13} style={{ flexShrink:0, marginTop:1 }} />
            <span>Rating report uploaded — please select the corresponding rating from the <strong>Credit rating (external)</strong> dropdown above so it appears on the assessment.</span>
          </div>
        )}
      </div>

      <div style={{ ...css.actions, flexDirection: isMobile ? "column-reverse" : "row", alignItems: isMobile ? "stretch" : "center" }}>
        {canGoNext && !loading && (
          <button
            onClick={() => goToSubStep(1)}
            style={{ ...css.btn, background:"transparent", color:"#1F2854", border:"1px solid #1F2854", display:"flex", alignItems:"center", gap:6 }}
          >
            Continue to CP Terms <ChevronRight size={14} />
          </button>
        )}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"stretch" }}>
          <button
            style={canExtract || loading ? { ...css.btn, display:"flex", alignItems:"center", gap:8, borderRadius: loading ? "6px 6px 0 0" : 6 } : { ...css.btnDis, display:"flex", alignItems:"center", gap:8 }}
            disabled={!canExtract && !loading}
            onClick={handleExtract}
          >
            {loading
              ? uploadPct < 100 && uploadPct > 0
                ? <><Loader size={14} style={{ animation:"spin 0.8s linear infinite", flexShrink:0 }} />Uploading… {uploadPct}%</>
                : <><Loader size={14} style={{ animation:"spin 0.8s linear infinite", flexShrink:0 }} />{EXTRACT_MESSAGES[msgIdx]}</>
              : anyValidating ? "Validating…"
              : fileChanged && hasExtracted ? "Re-extract with AI"
              : "Extract"}
          </button>
          {loading && (
            <div style={{ height:3, background:"rgba(255,255,255,0.25)", borderRadius:"0 0 6px 6px", overflow:"hidden" }}>
              <div style={{ height:"100%", background:"var(--accent)", width:`${progressPct}%`, transition:"width 0.9s ease", borderRadius:"0 0 6px 6px" }} />
            </div>
          )}
          {fileChanged && hasExtracted && !loading && (
            <div style={{ fontSize:11, color: extractionCount >= 2 ? "#A32D2D" : "#854F0B", marginTop:4, textAlign:"right" }}>
              {extractionCount >= 2
                ? "⚠ Another re-extraction will cost 1 credit"
                : "⚠ File changed — first re-extraction is free"}
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          year={confirm.year}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      )}
      {showExtractConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div className="sr-modal-inner" style={{ background:"#fff", borderRadius:10, padding:"28px 32px", maxWidth:420, width:"100%", boxShadow:"0 16px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
              <AlertTriangle size={22} color="#d4820a" />
              <div style={{ fontSize:15, fontWeight:"bold", color:"#1F2854" }}>Before you extract</div>
            </div>
            <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.75, marginBottom:20 }}>
              This will use <strong>1 credit</strong>. Please confirm:<br /><br />
              ✓ &nbsp;You have uploaded the correct financial statement<br />
              ✓ &nbsp;The client name matches the document<br />
              ✓ &nbsp;All details above are correctly filled
            </p>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setShowExtractConfirm(false)}
                style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#5A5A5A", fontFamily:"Arial,sans-serif" }}>
                Cancel
              </button>
              <button onClick={() => { setShowExtractConfirm(false); doExtract(); }}
                style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"none", background:"var(--accent)", color:"#fff", fontFamily:"Arial,sans-serif", fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                <CheckCircle size={13} /> Proceed
              </button>
            </div>
          </div>
        </div>
      )}
      {reExtractModal && (
        <ReExtractModal
          type={reExtractModal}
          onConfirm={() => { setReExtractModal(null); doExtract(); }}
          onCancel={() => setReExtractModal(null)}
        />
      )}
      {newAssessModal && (
        <NewAssessmentModal
          onConfirm={handleNewAssessConfirm}
          onCancel={() => { setNewAssessModal(null); }}
        />
      )}
    </div>
  );
}