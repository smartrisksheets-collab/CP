import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import Upload from "../components/steps/Upload.jsx";
import ReviewData from "../components/steps/ReviewData.jsx";
import Scores from "../components/steps/Scores.jsx";
import Result from "../components/steps/Result.jsx";
import Dashboard from "../components/Dashboard.jsx";
import { LogOut, BookOpen, LayoutDashboard, X, Zap, Shield, MessageCircle, ChevronDown, User, Mail } from "lucide-react";
import { getQuotaStatus } from "../api/client.js";
import Onboarding, { useOnboardingDone } from "../components/Onboarding.jsx";
import { useNavigate } from "react-router-dom";

const STEPS = ["Upload", "Review Data", "Scores", "Result"];

export default function AppPage() {
  const { user, logout }  = useAuth();
  const { tenant }        = useTenant();

  const [step, setStep]               = useState(0);
  const [figures, setFigures]         = useState(() => {
    try { const s = sessionStorage.getItem("sr_figures"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [clientInfo, setClientInfo]   = useState(() => {
    try { const s = sessionStorage.getItem("sr_clientInfo"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [scoreResult, setScoreResult] = useState(null);
  const [assessmentId, setAssessmentId] = useState(null);
  const [narrative, setNarrative]     = useState(null);
  const navigate = useNavigate();
  const [showDash, setShowDash]       = useState(false);
  const [showGuide, setShowGuide]     = useState(false);
  const [showFaq, setShowFaq]         = useState(false);
  const [legalModal, setLegalModal]   = useState(null);
  const [quotaMsg, setQuotaMsg]       = useState(null);
  const [mobileMenu, setMobileMenu]   = useState(false);
  const [showUserMenu,    setShowUserMenu]    = useState(false);
  const [showContact,     setShowContact]     = useState(false);
  const [quota, setQuota]             = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !useOnboardingDone());

  useEffect(() => {
    getQuotaStatus().then((res) => setQuota(res.data)).catch(() => {});
  }, [scoreResult]);

  useEffect(() => {
    try { sessionStorage.setItem("sr_figures", JSON.stringify(figures)); } catch {}
  }, [figures]);

  useEffect(() => {
    try { sessionStorage.setItem("sr_clientInfo", JSON.stringify(clientInfo)); } catch {}
  }, [clientInfo]);
  function startNew() {
    setStep(0);
    setFigures({});
    setClientInfo({});
    setScoreResult(null);
    setAssessmentId(null);
    setNarrative(null);
    try { sessionStorage.removeItem("sr_figures"); sessionStorage.removeItem("sr_clientInfo"); } catch {}
  }

  // ── Header ───────────────────────────────────────────────
  const header = (
    <div style={{
      background:"var(--primary)", padding:"12px 24px",
      display:"flex", alignItems:"center", justifyContent:"space-between",
      position:"sticky", top:0, zIndex:100,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {tenant?.logoUrl && (
          <img src={tenant.logoUrl} alt={tenant.clientName}
               style={{ width:36, height:36, borderRadius:6, objectFit:"contain", flexShrink:0 }} />
        )}
        <div>
          <div style={{ color:"var(--accent)", fontSize:16, fontWeight:"bold", letterSpacing:"0.03em" }}>SmartRisk Credit</div>
          <div style={{ color:"#999", fontSize:12 }}>Commercial Paper Risk Assessment</div>
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
            {quota.credits} credit{quota.credits !== 1 ? "s" : ""} remaining · {quota.plan}
          </div>
        )}
        <span className="sr-hdr-btn"><HdrBtn icon={<LayoutDashboard size={13}/>} label="Past Assessments" onClick={() => setShowDash(true)} /></span>
        <button onClick={() => setMobileMenu(v => !v)}
          className="sr-hamburger"
          aria-label="Menu"
          style={{ display:"none", flexDirection:"column", justifyContent:"center", gap:5, cursor:"pointer", padding:4, background:"none", border:"none" }}>
          <span style={{ display:"block", width:22, height:2, background:"#fff", borderRadius:2, transition:"all 0.25s", transform: mobileMenu ? "translateY(7px) rotate(45deg)" : "none" }} />
          <span style={{ display:"block", width:22, height:2, background:"#fff", borderRadius:2, transition:"all 0.25s", opacity: mobileMenu ? 0 : 1 }} />
          <span style={{ display:"block", width:22, height:2, background:"#fff", borderRadius:2, transition:"all 0.25s", transform: mobileMenu ? "translateY(-7px) rotate(-45deg)" : "none" }} />
        </button>

        {/* User dropdown */}
        <div style={{ position:"relative" }}>
          <button
            onClick={() => setShowUserMenu(v => !v)}
            style={{
              background:"none", border:"1px solid #3a4a7a", color:"#ccc",
              fontSize:11, padding:"5px 10px", borderRadius:5, cursor:"pointer",
              display:"flex", alignItems:"center", gap:5, fontFamily:"Arial,sans-serif",
            }}
          >
            <User size={13} />
            {user?.email?.split("@")[0]}
            <ChevronDown size={11} style={{ opacity:0.6 }} />
          </button>

          {showUserMenu && (
            <>
              {/* backdrop */}
              <div onClick={() => setShowUserMenu(false)}
                   style={{ position:"fixed", inset:0, zIndex:199 }} />
              <div style={{
                position:"absolute", top:"calc(100% + 6px)", right:0,
                background:"#1a2347", border:"1px solid #2e3f6e",
                borderRadius:8, minWidth:160, zIndex:200,
                boxShadow:"0 8px 24px rgba(0,0,0,0.4)",
                overflow:"hidden",
              }}>
                <div style={{ padding:"10px 12px", borderBottom:"1px solid #2e3f6e" }}>
                  <div style={{ fontSize:11, color:"#aaa" }}>{user?.email}</div>
                </div>
                <DropItem icon={<BookOpen size={13}/>}      label="User Guide" onClick={() => { setShowUserMenu(false); setShowGuide(true); }} />
                <DropItem icon={<MessageCircle size={13}/>} label="FAQ"        onClick={() => { setShowUserMenu(false); setShowFaq(true); }} />
                <div style={{ borderTop:"1px solid #2e3f6e", margin:"4px 0" }} />
                <DropItem icon={<Zap size={13}/>}           label="Buy Credits" onClick={() => { setShowUserMenu(false); navigate("/pricing"); }} />
                {["admin","superadmin"].includes(user?.role) && (
                  <DropItem icon={<Shield size={13}/>}  label="Admin Panel" onClick={() => { setShowUserMenu(false); navigate("/admin"); }} />
                )}
                <div style={{ borderTop:"1px solid #2e3f6e", margin:"4px 0" }} />
                <DropItem icon={<LogOut size={13}/>}    label="Sign Out"    onClick={logout} danger />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ── Stepper ──────────────────────────────────────────────
  const mobileMenuEl = mobileMenu && (
    <div style={{ background:"var(--primary)", borderTop:"1px solid #2a3870" }}>
      {STEPS.map((label, i) => {
        const active = i === step;
        const done   = i < step;
        return (
          <div key={i} style={{
            display:"flex", alignItems:"center", gap:12,
            padding:"14px 24px", fontSize:14,
            color: active ? "var(--accent)" : done ? "#1E7E34" : "#888",
            fontWeight: active ? "bold" : "normal",
            borderBottom:"1px solid #2a3870",
          }}>
            <span style={{
              width:24, height:24, borderRadius:"50%", flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:11, fontWeight:"bold",
              background: active ? "var(--accent)" : done ? "#1E7E34" : "#2a3870",
              color: active || done ? "#fff" : "#888",
            }}>
              {done ? "✓" : i + 1}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );

  const stepper = (
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
  if (step === 0) {
    content = (
      <Upload
        clientInfo={clientInfo}
        onClientInfoChange={setClientInfo}
        figures={figures}
        onFiguresChange={setFigures}
        onContinue={() => setStep(1)}
        onExtracted={(figs, updatedInfo) => {
          setFigures(figs);
          if (updatedInfo) setClientInfo(updatedInfo);
        }}
        onQuotaError={(msg) => setQuotaMsg(msg)}
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
        onQuotaExceeded={(msg) => setQuotaMsg(msg)}
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

  if (showGuide) return <UserGuidePage onBack={() => setShowGuide(false)} />;

  if (showOnboarding) return <Onboarding onDone={() => setShowOnboarding(false)} />;

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", paddingBottom:40 }}>
      <style>{`
        @media (max-width: 640px) {
          .sr-hamburger { display: flex !important; }
          .sr-stepper   { display: none !important; }
          .sr-hdr-btn   { display: none !important; }
        }
      `}</style>
      {header}
      {mobileMenuEl}
      <div className="sr-stepper">{stepper}</div>
      <div style={{ maxWidth:960, margin:"0 auto", width:"100%", padding:"24px 24px 0" }}>
        {content}
      </div>

      {/* Footer */}
      <div style={{
        background:"var(--primary)", color:"#999", fontSize:11,
        padding:"10px 24px", position:"fixed", bottom:0, left:0, right:0,
        display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:6,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <span>Powered by <span style={{ color:"var(--accent)" }}>SmartRisk Sheets Technologies Limited</span></span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          {[["Privacy","lm-privacy"],["Terms","lm-terms"],["Disclaimer","lm-disclaimer"],["Legal Notice","lm-legal"]].map(([label, id]) => (
            <button key={id} onClick={() => setLegalModal(id)}
              style={{ background:"none", border:"none", color:"#999", fontSize:11, cursor:"pointer", padding:0, textDecoration:"none" }}
              onMouseEnter={e => e.target.style.color="#ccc"} onMouseLeave={e => e.target.style.color="#999"}>
              {label}
            </button>
          ))}
          <button onClick={() => setShowContact(true)}
            style={{ background:"none", border:"none", color:"#999", fontSize:11, cursor:"pointer", padding:0 }}
            onMouseEnter={e => e.target.style.color="#ccc"} onMouseLeave={e => e.target.style.color="#999"}>
            Contact
          </button>
        </div>
      </div>

      {/* Legal modals */}
      {legalModal && <LegalModal id={legalModal} onClose={() => setLegalModal(null)} />}

      {/* Quota modal */}
      {quotaMsg && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:10, padding:"28px 28px 22px", maxWidth:420, width:"90%", boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ marginBottom:12 }}>
              <Zap size={28} color="var(--accent)" strokeWidth={1.75} />
            </div>
            <div style={{ fontSize:15, fontWeight:"bold", color:"var(--primary)", marginBottom:8 }}>Monthly Limit Reached</div>
            <div style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.65, marginBottom:20 }}>{quotaMsg} Purchase credits to continue.</div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setQuotaMsg(null)}
                style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"var(--primary)", fontFamily:"Arial,sans-serif" }}>
                Close
              </button>
              <button onClick={() => { setQuotaMsg(null); navigate("/pricing"); }}
                style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"none", background:"var(--accent)", color:"#fff", fontFamily:"Arial,sans-serif", fontWeight:600 }}>
                Buy Credits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard modal */}
      {showDash && (
        <Modal onClose={() => setShowDash(false)} title="Past Assessments">
          <Dashboard />
        </Modal>
      )}

      {/* Contact modal */}
      {showContact && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
             onClick={(e) => e.target === e.currentTarget && setShowContact(false)}>
          <div style={{ background:"#fff", borderRadius:12, width:"100%", maxWidth:420, padding:"32px 28px", position:"relative", boxShadow:"0 24px 80px rgba(0,0,0,0.25)", textAlign:"center" }}>
            <button onClick={() => setShowContact(false)} style={{ position:"absolute", top:14, right:18, background:"none", border:"none", cursor:"pointer", color:"#888" }}>
              <X size={18} />
            </button>
            <div style={{ fontSize:17, fontWeight:"bold", color:"var(--primary)", marginBottom:6 }}>Get in touch</div>
            <div style={{ fontSize:13, color:"#888", marginBottom:28 }}>Choose how you'd like to reach us.</div>
            <div style={{ display:"flex", gap:16, justifyContent:"center", marginBottom:20 }}>
              <a href="mailto:info@smartrisksheets.com"
                style={{ flex:1, maxWidth:160, display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"20px 16px", border:"1px solid #E0E0E0", borderRadius:10, textDecoration:"none", background:"#fff", transition:"all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#01b88e"; e.currentTarget.style.background="#f0faf7"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#E0E0E0"; e.currentTarget.style.background="#fff"; }}>
                <Mail size={28} color="#1F2854" strokeWidth={1.5} />
                <div style={{ fontSize:13, fontWeight:"bold", color:"#1F2854" }}>Email us</div>
                <div style={{ fontSize:11, color:"#888" }}>info@smartrisksheets.com</div>
              </a>
              <a href="https://wa.me/2349052288923" target="_blank" rel="noreferrer"
                style={{ flex:1, maxWidth:160, display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"20px 16px", border:"1px solid #E0E0E0", borderRadius:10, textDecoration:"none", background:"#fff", transition:"all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#25D366"; e.currentTarget.style.background="#f0fdf4"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#E0E0E0"; e.currentTarget.style.background="#fff"; }}>
                <MessageCircle size={28} color="#25D366" strokeWidth={1.5} />
                <div style={{ fontSize:13, fontWeight:"bold", color:"#1F2854" }}>WhatsApp</div>
                <div style={{ fontSize:11, color:"#888" }}>Eddu SmartRisk</div>
              </a>
            </div>
            <div style={{ fontSize:11, color:"#aaa", lineHeight:1.7 }}>
              WhatsApp for quick help during assessments · Email for account and billing queries<br />
              We typically respond within a few hours on business days.
            </div>
          </div>
        </div>
      )}

      {/* FAQ modal */}
      {showFaq && (
        <Modal onClose={() => setShowFaq(false)} title="Frequently Asked Questions">
          <FaqContent />
        </Modal>
      )}
    </div>
  );
}

function DropItem({ icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      display:"flex", alignItems:"center", gap:8, width:"100%",
      padding:"9px 14px", background:"none", border:"none",
      color: danger ? "#f87171" : "#ccc", fontSize:12,
      cursor:"pointer", textAlign:"left", fontFamily:"Arial,sans-serif",
    }}
    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
    onMouseLeave={e => e.currentTarget.style.background = "none"}
    >
      {icon}{label}
    </button>
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

const LEGAL = {
  "lm-privacy": {
    title: "Privacy Policy", date: "April 2026",
    body: [
      ["1. Who we are", "SmartRisk Sheets Technologies Limited ('SmartRisk', 'we', 'our') operates the SmartRisk Credit platform at score.smartrisksheets.com."],
      ["2. What we collect", "We collect your email address at login to verify authorised access. We do not collect payment card details (handled by Paystack). We do not collect the contents of uploaded financial documents beyond the active session."],
      ["3. How we use it", "Your email is used solely to manage access to the platform. Assessment results (client name, scores) are logged to a secure record for your organisation. We do not sell, rent, or share your data with third parties."],
      ["4. Data retention", "Uploaded financial documents are not stored beyond your active session. Email addresses are retained for as long as your account is active. You may request deletion at any time."],
      ["5. Security", "Data in transit is encrypted via HTTPS/TLS. Access to backend systems is restricted to authorised personnel only."],
      ["6. Your rights", "You have the right to access, correct, or request deletion of your personal data at any time. Email support@smartrisksheets.com with the subject line \"Data Request.\" We will respond within 10 working days."],
      ["7. Cookies", "We use essential session cookies only — no tracking, no advertising, no third-party cookies."],
      ["8. Contact", "General enquiries: info@smartrisksheets.com\nData deletion or complaints: support@smartrisksheets.com"],
    ]
  },
  "lm-terms": {
    title: "Terms of Use", date: "April 2026",
    body: [
      ["1. Acceptance", "By using SmartRisk Credit you agree to these terms. If you do not agree, discontinue use immediately."],
      ["2. Nature of the service", "SmartRisk Credit is an AI-assisted quantitative credit risk scoring tool designed for Nigerian capital markets professionals. It is intended to support — not replace — professional credit analysis and judgment."],
      ["3. Not financial advice", "All scores, ratios, narratives, and PDF reports generated by this tool are for informational and internal reference purposes only. They do not constitute financial advice, investment recommendations, or a substitute for regulated credit analysis. SmartRisk Sheets Technologies Limited accepts no liability for any decision made on the basis of outputs from this tool."],
      ["4. Intellectual property", "The SmartRisk Credit scoring model, benchmarks, weighting methodology, and report templates are proprietary to SmartRisk Sheets Technologies Limited. You may not reproduce, reverse-engineer, or redistribute any part of the scoring engine."],
      ["5. Dispute resolution", "Contact support@smartrisksheets.com with subject \"Formal Complaint.\" We acknowledge within 5 working days and aim to resolve within 30 days."],
      ["6. Governing law", "These terms are governed by the laws of the Federal Republic of Nigeria."],
    ]
  },
  "lm-disclaimer": {
    title: "Disclaimer", date: "April 2026",
    body: [
      ["", "SmartRisk Credit generates quantitative credit risk scores based on financial data extracted from uploaded documents. The outputs of this tool — including scores, ratio analyses, narratives, and PDF reports — are for internal reference and decision support only."],
      ["", "These outputs do not constitute a credit rating, financial advice, or an investment recommendation. They should not be relied upon as the sole basis for any investment, lending, or credit decision."],
      ["", "SmartRisk Sheets Technologies Limited makes no representation or warranty, express or implied, as to the accuracy, completeness, or fitness for purpose of any output generated by this tool. The company shall not be liable for any loss or damage — direct, indirect, or consequential — arising from reliance on any output produced by SmartRisk Credit."],
      ["", "Users are responsible for independently verifying all extracted figures against source financial statements before relying on any assessment output."],
    ]
  },
  "lm-legal": {
    title: "Legal Notice", date: "April 2026",
    body: [
      ["1. Company identity", "SmartRisk Sheets Technologies Limited is the legal entity responsible for operating the SmartRisk Credit platform at score.smartrisksheets.com."],
      ["2. Registered details", "SmartRisk Sheets Technologies Limited is incorporated in the Federal Republic of Nigeria under the Companies and Allied Matters Act (CAMA). RC Number: 9170218."],
      ["3. Platform ownership", "All content on this platform — including scoring methodology, report templates, ratio benchmarks, and software — is owned by or licensed to SmartRisk Sheets Technologies Limited. Unauthorised reproduction or distribution is prohibited."],
      ["4. Regulatory status", "SmartRisk Credit is a technology tool providing quantitative financial analysis for internal use by capital markets professionals. It is not a licensed credit rating agency and does not provide regulated financial advice under Nigerian law."],
      ["5. Governing law", "This Legal Notice and all matters relating to this platform are governed by the laws of the Federal Republic of Nigeria."],
      ["6. Contact", "General enquiries: info@smartrisksheets.com\nComplaints & data requests: support@smartrisksheets.com"],
    ]
  },
};

function LegalModal({ id, onClose }) {
  const doc = LEGAL[id];
  if (!doc) return null;
  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()}
         style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:12, maxWidth:640, width:"100%", maxHeight:"80vh", overflowY:"auto", padding:"36px 40px", position:"relative", boxShadow:"0 24px 80px rgba(0,0,0,0.25)" }}>
        <button onClick={onClose} style={{ position:"absolute", top:14, right:18, background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#888", lineHeight:1 }}>
          <X size={18} />
        </button>
        <h2 style={{ fontSize:20, fontWeight:"bold", color:"var(--primary)", marginBottom:6 }}>{doc.title}</h2>
        <div style={{ fontSize:12, color:"#888", marginBottom:22 }}>Last updated: {doc.date}</div>
        {doc.body.map(([heading, text], i) => (
          <div key={i}>
            {heading && <h3 style={{ fontSize:14, fontWeight:"bold", color:"var(--primary)", margin:"18px 0 6px" }}>{heading}</h3>}
            <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.75, marginBottom:10, whiteSpace:"pre-line" }}>{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqContent() {
  const faqs = [
    ["What does SmartRisk Credit actually do?", "SmartRisk Credit is an AI-assisted credit risk scoring tool for Nigerian capital markets professionals. You upload a company's audited financial statements, the AI extracts the key figures, and the tool computes 10 standardised ratios to produce a total score out of 56. A score of 34 or above (60%) indicates the issuer is eligible for a investing in Commercial Papers (CPs)."],
    ["Is the score a formal credit rating?", "No. The SmartRisk Credit score is a quantitative decision-support tool for internal use only. It is not a regulated credit rating and does not replace the opinion of a licensed credit rating agency such as Agusto & Co., GCR Ratings, or DataPro."],
    ["What financial statements should I upload?", "Upload the most recent audited annual financial statements for the issuing entity — not the group. The document should include the Statement of Comprehensive Income, Statement of Financial Position, Statement of Cash Flows, and Notes to the Accounts."],
    ["Why standalone figures and not group figures?", "The obligor on the CP is the legal entity itself, not the group. Group consolidated figures include subsidiary revenues and assets not available to service the CP. The AI is specifically instructed to extract standalone figures."],
    ["What if the AI extracts the wrong figures?", "Every extracted figure is shown on the Review Data screen before scores are computed. You can edit any field manually. Blue fields were populated by AI; amber fields require manual entry."],
    ["How is the cut-off score of 34 determined?", "The cut-off is set at 60% of the maximum possible score of 56 points. This threshold was calibrated against the financial profiles of investment-grade issuers in the Nigerian capital market."],
    ["Is my uploaded data stored or shared?", "No. Uploaded documents are processed only to extract financial figures and are not retained after your session ends. Your email is used only for access management."],
    ["How do I upgrade my plan?", "Click 'Buy Credits' in the header, or email info@smartrisksheets.com with the subject line 'SmartRisk Credit — Upgrade Request'."],
    ["Can I use this tool for bonds or other fixed income instruments?", "The current version of SmartRisk Credit is purpose-built for Commercial Paper assessment. Bond, Eurobond, Promissory Note, and Bank Facility assessment are all coming in SmartRisk Credit v2, which includes a 14-ratio scoring engine, covenant tracker, debt maturity profiling, and a 5-page investment-grade report. Waitlist members get priority access and founding member pricing when v2 launches."],
    ["How can my firm partner with SmartRisk Credit?", "We welcome partnerships with asset managers, issuing houses, pension fund administrators, and capital markets infrastructure providers. If you are interested in a white-label deployment, data integration, or referral arrangement, email info@smartrisksheets.com with the subject line \"Partnership Enquiry.\" We typically respond within 2 working days."],
    ["I need quick help — how do I reach the team?", "For step-by-step guidance, check the User Guide button in the top navigation first — most questions are answered there. For quick support during an active assessment, WhatsApp us on 0905 228 8923 — we typically respond within a few hours on business days. For account, billing, or access issues email info@smartrisksheets.com."],
  ];
  const [open, setOpen] = useState(null);
  return (
    <div>
      {faqs.map(([q, a], i) => (
        <div key={i} style={{ borderBottom:"1px solid #F0F0F0", padding:"12px 0" }}>
          <div onClick={() => setOpen(open === i ? null : i)}
               style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", fontSize:14, fontWeight:500, color:"#1F2854" }}>
            {q}
            <span style={{ fontSize:16, color:"#888", marginLeft:12, flexShrink:0, transform: open === i ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}>⌄</span>
          </div>
          {open === i && <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.7, marginTop:8 }}>{a}</p>}
        </div>
      ))}
    </div>
  );
}

function UserGuidePage({ onBack }) {
  const RATIOS = [
    ["Acid-Test Ratio",         2,  "Can the company meet short-term obligations from liquid assets alone? Excludes inventory and prepayments — a stricter test than the current ratio.",        "> 1.5x"],
    ["Net Income Margin",       4,  "How much of each naira of revenue becomes profit after all costs and tax. A proxy for pricing power and cost discipline.",                               "> 20%"],
    ["Revenue Growth Rate",     5,  "Year-on-year top-line growth. Signals whether the business is expanding or contracting — critical for short-tenor debt repayment confidence.",           "> 30%"],
    ["Return on Assets",        5,  "How efficiently the company generates profit from its asset base. Higher ROA signals better capital deployment and earning quality.",                    "> 30%"],
    ["Debt to Asset Ratio",     5,  "What proportion of total assets is funded by debt. A low ratio means creditors have a large cushion if assets need to be liquidated.",                  "< 30%"],
    ["Debt to Capital Ratio",   5,  "The share of total capital (debt + equity) that is debt-funded. Measures structural leverage and the buffer available to absorb losses.",               "< 30%"],
    ["Interest Coverage Ratio", 6,  "How many times operating profit covers interest charges. A ratio below 1.5x means most of operating profit is consumed by interest — a major red flag.", "> 5.0x"],
    ["Debt Service Coverage",   7,  "EBITDA relative to total debt stock. A low ratio means the company generates strong cash flow relative to its debt — favourable for a CP investor.",   "< 0.5x*"],
    ["Net Debt / EBITDA",       7,  "How many years of operating cash flow would be needed to repay all net debt. The most widely used leverage metric by Nigerian rating agencies.",        "< 2.0x"],
    ["Altman Z-Score",         10,  "A multi-factor bankruptcy predictor combining working capital, retained earnings, profitability, leverage, and asset turnover. Score above 3 indicates low distress risk.", "> 3.0"],
  ];

  const STEPS = [
    ["Upload",          "Enter the client name, select an external credit rating (optional), and upload the audited financial statements PDF. Optionally upload the credit rating report and a CP indicative terms email. The tool validates each document before proceeding."],
    ["Extraction",      "The financial statement is sent for review and extraction, which reads the primary financial statements and extract figures. This takes 20–60 seconds. All extracted figures are shown on the Review Data screen for you to verify and correct."],
    ["Review Data",     "Check every field carefully. Blue fields were extracted by AI. Amber fields require manual entry (e.g. Prior Year Revenue for the growth rate). Always verify revenue, EBIT, and debt figures against the face of the financial statements."],
    ["Compute Scores",  "Click \"Compute Scores\" to calculate all 10 ratios client-side. Review the ratio table and scores before proceeding. You can go back and edit any figure."],
    ["View Result",     "Click \"View Result\" to run the final server-side assessment and generate the narrative. The result screen shows the verdict (Eligible / Not Eligible), score breakdown, and report export options."],
    ["Export Report",   "Starter and above can preview and edit the generated narrative before exporting. Free users can export directly. The report is a PDF containing the CP terms, risk narrative, financial figures, and quantitative score table."],
  ];

  const card = { background:"#fff", border:"1px solid #E8E8E8", borderRadius:10, padding:"24px 28px", marginBottom:20 };
  const sectionTitle = { fontSize:15, fontWeight:"bold", color:"var(--primary)", marginBottom:4, paddingBottom:8, borderBottom:"2px solid var(--accent)" };

  return (
    <div style={{ minHeight:"100vh", background:"#F5F6F8", paddingBottom:60 }}>
      {/* Header */}
      <div style={{ background:"var(--primary)", padding:"18px 32px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ color:"var(--accent)", fontSize:17, fontWeight:"bold" }}>User Guide</div>
          <div style={{ color:"#999", fontSize:12, marginTop:2 }}>How SmartRisk Credit works and how scores are calculated</div>
        </div>
        <button onClick={onBack} style={{
          display:"flex", alignItems:"center", gap:6, background:"var(--primary)",
          border:"1px solid #3a4a7a", color:"#ccc", padding:"8px 14px",
          borderRadius:6, cursor:"pointer", fontSize:12, fontFamily:"Arial,sans-serif",
        }}>
          ← Back to App
        </button>
      </div>

      <div style={{ maxWidth:860, margin:"0 auto", padding:"28px 24px 0" }}>

        {/* Overview */}
        <div style={card}>
          <div style={sectionTitle}>Overview</div>
          <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.8, marginTop:12, marginBottom:8 }}>
            SmartRisk Credit is an AI-assisted quantitative credit risk scoring tool for Nigerian capital markets professionals.
            It is designed to help analysts assess whether a corporate issuer meets the minimum credit quality threshold for investing in Commercial Papers (CPs) or Promissory Notes.
          </p>
          <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.8 }}>
            The tool processes audited financial statements, extracts key financial figures using artificial intelligence (AI), computes 10 standardised financial ratios,
            and produces a total score out of <strong>56 points</strong>. A score of <strong>34 or above (60%)</strong> indicates the issuer is eligible for investment consideration.
          </p>
        </div>

        {/* Step-by-step */}
        <div style={card}>
          <div style={sectionTitle}>Step-by-Step Workflow</div>
          <div style={{ marginTop:14 }}>
            {STEPS.map(([title, body], i) => (
              <div key={i} style={{ display:"flex", gap:14, marginBottom:14 }}>
                <div style={{
                  width:26, height:26, borderRadius:"50%", background:"var(--primary)",
                  color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:11, fontWeight:"bold", flexShrink:0, marginTop:1,
                }}>{i + 1}</div>
                <div style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.75 }}>
                  <strong style={{ color:"var(--primary)" }}>{title}</strong> — {body}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scoring table */}
        <div style={card}>
          <div style={sectionTitle}>Scoring Model — 10 Ratios, 56 Points</div>
          <p style={{ fontSize:13, color:"#5A5A5A", marginTop:10, marginBottom:14 }}>
            Each ratio is scored against defined bands. The total score determines eligibility. The cut-off is 34 points (60% of 56).
          </p>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"var(--primary)" }}>
                  {["Ratio","What it measures","Max Score","Best Practice"].map(h => (
                    <th key={h} style={{ color:"#fff", padding:"9px 12px", textAlign:"left", fontSize:11, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RATIOS.map(([name, max, desc, best], i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9F9F7" }}>
                    <td style={{ padding:"9px 12px", borderBottom:"1px solid #F0F0F0", fontWeight:600, color:"#1F2854", whiteSpace:"nowrap", verticalAlign:"top" }}>{name}</td>
                    <td style={{ padding:"9px 12px", borderBottom:"1px solid #F0F0F0", color:"#5A5A5A", lineHeight:1.65, verticalAlign:"top" }}>{desc}</td>
                    <td style={{ padding:"9px 12px", borderBottom:"1px solid #F0F0F0", textAlign:"center", fontWeight:"bold", color:"var(--primary)", verticalAlign:"top" }}>{max}</td>
                    <td style={{ padding:"9px 12px", borderBottom:"1px solid #F0F0F0", textAlign:"center", color:"#5A5A5A", verticalAlign:"top", whiteSpace:"nowrap" }}>{best}</td>
                  </tr>
                ))}
                <tr style={{ background:"var(--primary)" }}>
                  <td style={{ padding:"9px 12px", color:"#fff", fontWeight:"bold" }}>Total</td>
                  <td style={{ padding:"9px 12px" }} />
                  <td style={{ padding:"9px 12px", color:"var(--accent)", fontWeight:"bold", textAlign:"center" }}>56</td>
                  <td style={{ padding:"9px 12px", color:"rgba(255,255,255,0.6)", fontSize:11 }}>Cut-off: 34 pts (60%)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ fontSize:11, color:"#888", marginTop:10, lineHeight:1.6 }}>
            * DSCR scoring is inverted by design: a very low DSCR (e.g. &lt;0.5x) means the company has minimal debt relative to EBITDA, which is favourable. A very high DSCR means the company is heavily leveraged, which attracts a penalty score.
          </p>
        </div>

        {/* Colour guide */}
        <div style={card}>
          <div style={sectionTitle}>Score Colour Guide</div>
          <p style={{ fontSize:13, color:"#5A5A5A", marginTop:10, marginBottom:14 }}>
            On the Score Review and Result screens, each ratio score is colour-coded:
          </p>
          {[
            ["#27ae60","#EAF7EF","Green",  "Score equals the maximum for that ratio — best possible band achieved."],
            ["#d4820a","#FEF6E7","Amber",  "Score is positive but below maximum — within acceptable range."],
            ["#c0392b","#FDECEA","Red",    "Score is zero or negative — a penalty band. This drags the total score down significantly."],
          ].map(([color, bg, label, desc]) => (
            <div key={label} style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 }}>
              <span style={{ background:bg, color, border:`1px solid ${color}`, borderRadius:4, padding:"2px 10px", fontSize:12, fontWeight:600, flexShrink:0 }}>{label}</span>
              <span style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.7 }}>{desc}</span>
            </div>
          ))}
        </div>

        {/* Important notes */}
        <div style={card}>
          <div style={sectionTitle}>Important Notes</div>
          <div style={{ marginTop:12 }}>
            {[
              ["Standalone figures only.",              "For group companies, always use the standalone (Company) figures, not consolidated (Group) figures. The obligor on the CP is the legal entity, not the group. We extract standalone figures — verify this on the Review Data screen."],
              ["Interest rates are required for the Interest Coverage Ratio.", "If the notes do not state a specific rate, use the CBN MPR plus the applicable spread, or the rate stated in the borrowing agreement. Enter as a percentage (e.g. 21.5 for 21.5%)."],
              ["Prior Year Revenue is required for the Revenue Growth Rate.", "This is the only figure not extractable from a single year's statements. Enter it manually on the Review Data screen."],
              ["The score is not a credit rating.",     "It is a quantitative decision-support tool for internal use. Always supplement with qualitative analysis and consider the external credit rating in context."],
            ].map(([bold, text]) => (
              <p key={bold} style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.75, marginBottom:12 }}>
                <strong style={{ color:"#1F2854" }}>{bold}</strong> {text}
              </p>
            ))}
          </div>
        </div>

        <div style={{ textAlign:"right", paddingBottom:20 }}>
          <button onClick={onBack} style={{
            display:"inline-flex", alignItems:"center", gap:6, background:"var(--primary)",
            border:"none", color:"#fff", padding:"10px 20px",
            borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"Arial,sans-serif", fontWeight:600,
          }}>
            ← Back to App
          </button>
        </div>
      </div>
    </div>
  );
}