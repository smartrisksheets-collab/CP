import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import Upload from "../components/steps/Upload.jsx";
import Extraction from "../components/steps/Extraction.jsx";
import ReviewData from "../components/steps/ReviewData.jsx";
import Scores from "../components/steps/Scores.jsx";
import Result from "../components/steps/Result.jsx";
import Dashboard from "../components/Dashboard.jsx";
import { LogOut, BookOpen, HelpCircle, LayoutDashboard, X } from "lucide-react";

const STEPS = ["Upload", "Review Data", "Scores", "Result"];

export default function AppPage() {
  const { user, logout }  = useAuth();
  const { tenant }        = useTenant();

  const [step, setStep]               = useState(0);          // 0-3 = main steps
  const [extracting, setExtracting]   = useState(false);      // extraction loading screen
  const [figures, setFigures]         = useState({});
  const [clientInfo, setClientInfo]   = useState({});
  const [scoreResult, setScoreResult] = useState(null);
  const [assessmentId, setAssessmentId] = useState(null);
  const [narrative, setNarrative]     = useState(null);
  const [showDash, setShowDash]       = useState(false);
  const [showGuide, setShowGuide]     = useState(false);
  const [quota, setQuota]             = useState(null);

  useEffect(() => {
    import("../api/client.js").then(({ getQuotaStatus }) => {
      getQuotaStatus().then((res) => setQuota(res.data)).catch(() => {});
    });
  }, [scoreResult]); // refresh after every completed assessment
  function startNew() {
    setStep(0);
    setExtracting(false);
    setFigures({});
    setClientInfo({});
    setScoreResult(null);
    setAssessmentId(null);
    setNarrative(null);
  }

  // ── Header ───────────────────────────────────────────────
  const header = (
    <div style={{
      background:"var(--primary)", padding:"10px 24px",
      display:"flex", alignItems:"center", justifyContent:"space-between",
      position:"sticky", top:0, zIndex:100,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {tenant?.logoUrl && (
          <img src={tenant.logoUrl} alt={tenant.clientName}
               style={{ height:32, width:"auto", objectFit:"contain" }} />
        )}
        <div>
          <div style={{ color:"var(--accent)", fontSize:15, fontWeight:"bold" }}>SmartRisk Credit</div>
          <div style={{ color:"#999", fontSize:11 }}>CP &amp; Promissory Note Assessment</div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        {quota && (
          <div style={{
            fontSize:11, padding:"4px 10px", borderRadius:5,
            background: quota.allowed ? "rgba(1,184,142,0.15)" : "rgba(162,45,45,0.2)",
            border: `1px solid ${quota.allowed ? "rgba(1,184,142,0.4)" : "rgba(162,45,45,0.4)"}`,
            color: quota.allowed ? "#01b88e" : "#F09595",
            fontWeight:"bold", whiteSpace:"nowrap",
          }}>
            {quota.used}/{quota.limit} assessments · {quota.plan}
          </div>
        )}
        <HdrBtn icon={<LayoutDashboard size={13}/>} label="Dashboard" onClick={() => setShowDash(true)} />
        <HdrBtn icon={<BookOpen size={13}/>}        label="User Guide" onClick={() => setShowGuide(true)} />
        <HdrBtn icon={<LogOut size={13}/>}          label="Sign Out"   onClick={logout} />
      </div>
    </div>
  );

  // ── Stepper ──────────────────────────────────────────────
  const stepper = !extracting && (
    <div style={{
      display:"flex", background:"#fff",
      borderBottom:"1px solid #E0E0E0",
    }}>
      {STEPS.map((label, i) => {
        const active = i === step;
        const done   = i < step;
        return (
          <div key={i} style={{
            flex:1, padding:"12px 16px", fontSize:13,
            color: done ? "#1E7E34" : active ? "var(--primary)" : "#888",
            fontWeight: active ? "bold" : "normal",
            background: active ? "#FAFAFA" : "transparent",
            borderBottom: active ? "3px solid var(--accent)" : "3px solid transparent",
            borderRight:"1px solid #E8E8E8",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <span style={{
              width:22, height:22, borderRadius:"50%", flexShrink:0,
              background: done ? "#1E7E34" : active ? "var(--primary)" : "#E8E8E8",
              color: done || active ? "#fff" : "#666",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize: done ? 13 : 11, fontWeight:"bold",
            }}>
              {done ? "✓" : i + 1}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );

  // ── Main content ─────────────────────────────────────────
  let content;
  if (extracting) {
    content = (
      <Extraction onDone={(figs) => {
        setFigures(figs);
        setExtracting(false);
        setStep(1);
      }} />
    );
  } else if (step === 0) {
    content = (
      <Upload
        clientInfo={clientInfo}
        onClientInfoChange={setClientInfo}
        onExtractStart={(info, extractPromise) => {
          setClientInfo(info);
          setExtracting(true);
          extractPromise
            .then((figs) => {
              setFigures(figs);
              setExtracting(false);
              setStep(1);
            })
            .catch(() => setExtracting(false));
        }}
      />
    );
  } else if (step === 1) {
    content = (
      <ReviewData
        figures={figures}
        onChange={setFigures}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
      />
    );
  } else if (step === 2) {
    content = (
      <Scores
        figures={figures}
        scoreResult={scoreResult}
        onScored={setScoreResult}
        onBack={() => setStep(1)}
        onNext={(result, id, narr) => {
          setScoreResult(result);
          setAssessmentId(id);
          setNarrative(narr);
          setStep(3);
        }}
        clientInfo={clientInfo}
      />
    );
  } else if (step === 3) {
    content = (
      <Result
        scoreResult={scoreResult}
        assessmentId={assessmentId}
        narrative={narrative}
        clientInfo={clientInfo}
        onBack={() => setStep(2)}
        onNew={startNew}
      />
    );
  }

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", paddingBottom:40 }}>
      {header}
      {stepper}
      <div style={{ maxWidth:960, margin:"0 auto", width:"100%", padding:"24px 24px 0" }}>
        {content}
      </div>

      {/* Footer */}
      <div style={{
        background:"var(--primary)", color:"#999", fontSize:11,
        padding:"10px 24px", position:"fixed", bottom:0, left:0, right:0,
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <span>SmartRisk Sheets Technologies Limited (RC: 9170218)</span>
        <span style={{ color:"var(--accent)" }}>{user?.email}</span>
      </div>

      {/* Dashboard modal */}
      {showDash && (
        <Modal onClose={() => setShowDash(false)} title="Past Assessments">
          <Dashboard />
        </Modal>
      )}

      {/* User guide modal */}
      {showGuide && (
        <Modal onClose={() => setShowGuide(false)} title="User Guide">
          <UserGuide />
        </Modal>
      )}
    </div>
  );
}

function HdrBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      background:"none", border:"1px solid #3a4a7a", color:"#ccc",
      fontSize:11, padding:"5px 10px", borderRadius:5, cursor:"pointer",
      display:"flex", alignItems:"center", gap:5, fontFamily:"Arial,sans-serif",
    }}>
      {icon}{label}
    </button>
  );
}

function Modal({ onClose, title, children }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
      zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24,
    }}>
      <div style={{
        background:"#fff", borderRadius:12, width:"100%", maxWidth:760,
        maxHeight:"85vh", overflow:"auto", padding:"32px 36px", position:"relative",
        boxShadow:"0 24px 80px rgba(0,0,0,0.25)",
      }}>
        <button onClick={onClose} style={{
          position:"absolute", top:14, right:18, background:"none",
          border:"none", cursor:"pointer", color:"#888",
        }}>
          <X size={20} />
        </button>
        <h2 style={{ fontSize:18, fontWeight:"bold", color:"var(--primary)", marginBottom:20 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function UserGuide() {
  return (
    <div style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.75 }}>
      <h3 style={{ color:"var(--primary)", marginBottom:8 }}>Overview</h3>
      <p style={{ marginBottom:16 }}>
        SmartRisk Credit is an AI-assisted quantitative credit risk scoring tool for Nigerian capital markets professionals.
        It processes audited financial statements, extracts key figures using AI, computes 10 standardised financial ratios,
        and produces a total score out of <strong>56 points</strong>. A score of <strong>34 or above (60%)</strong> indicates
        the issuer is eligible for investment consideration.
      </p>
      <h3 style={{ color:"var(--primary)", marginBottom:8 }}>Workflow</h3>
      {[
        ["Upload",       "Enter client name, select credit rating, upload the audited financial statements PDF. Optionally upload the credit rating report and CP indicative terms."],
        ["Review Data",  "Check every extracted field. Blue fields were populated by AI. Amber fields require manual entry. Always verify revenue, EBIT, and debt figures."],
        ["Scores",       "Review the 10 ratio table and scores. Click View Result to run the assessment and generate the narrative."],
        ["Result",       "View the verdict (Eligible / Not Eligible), score breakdown, AI narrative, and export the PDF report."],
      ].map(([title, body], i) => (
        <div key={i} style={{ display:"flex", gap:12, marginBottom:12 }}>
          <div style={{
            width:24, height:24, borderRadius:"50%", background:"var(--primary)",
            color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:11, fontWeight:"bold", flexShrink:0, marginTop:1,
          }}>{i+1}</div>
          <div><strong style={{ color:"var(--primary)" }}>{title}</strong> — {body}</div>
        </div>
      ))}
      <h3 style={{ color:"var(--primary)", margin:"16px 0 8px" }}>Scoring Model</h3>
      <p>10 ratios, 56 points max, cutoff 34 (60%). Negative scores are possible for ratios in distress bands.</p>
    </div>
  );
}