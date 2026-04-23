import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Check, Loader } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { requestOTP, verifyOTP } from "../api/client.js";

const S = {
  wrapper  : { display:"flex", height:"100vh", width:"100vw", overflow:"hidden" },
  left     : {
    flex:"0 0 55%", background:"var(--primary)", position:"relative",
    display:"flex", flexDirection:"column", justifyContent:"space-between",
    padding:"32px 48px", overflow:"hidden",
  },
  ring1    : {
    position:"absolute", width:600, height:600, borderRadius:"50%",
    border:"1px solid rgba(var(--accent-rgb),0.12)", top:-180, right:-180, pointerEvents:"none",
  },
  ring2    : {
    position:"absolute", width:400, height:400, borderRadius:"50%",
    border:"1px solid rgba(var(--accent-rgb),0.08)", bottom:-100, left:-100, pointerEvents:"none",
  },
  accentBar: {
    position:"absolute", top:0, left:0, width:4, height:"100%",
    background:"var(--accent)",
  },
  heroLabel: {
    display:"inline-block", fontSize:11, fontWeight:600,
    letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--accent)",
    border:"1px solid rgba(var(--accent-rgb),0.3)", padding:"5px 12px",
    borderRadius:20, marginBottom:14,
  },
  heroHeading: {
    fontSize:30, fontWeight:700, color:"#fff", lineHeight:1.2,
    marginBottom:14, fontFamily:"'Playfair Display', serif",
  },
  heroSub  : { fontSize:15, color:"rgba(255,255,255,0.55)", lineHeight:1.7, maxWidth:380, marginBottom:14 },
  statStrip: { display:"flex", gap:10, marginBottom:20 },
  stat     : {
    background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)",
    borderRadius:10, padding:"10px 14px",
  },
  statVal  : { fontSize:18, fontWeight:700, color:"var(--accent)", fontFamily:"'Playfair Display', serif" },
  statLbl  : { fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:1 },
  steps    : { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px 16px", position:"relative", zIndex:2 },
  step     : { display:"flex", alignItems:"flex-start", gap:16 },
  stepNum  : {
    width:28, height:28, borderRadius:"50%",
    background:"rgba(var(--accent-rgb),0.15)", border:"1px solid rgba(var(--accent-rgb),0.4)",
    color:"var(--accent)", fontSize:12, fontWeight:600,
    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
  },
  right    : {
    flex:1, display:"flex", alignItems:"center", justifyContent:"center",
    padding:"48px 56px", background:"#f9f6ef",
  },
  card     : { width:"100%", maxWidth:380 },
  eyebrow  : {
    fontSize:11, fontWeight:600, letterSpacing:"0.1em",
    textTransform:"uppercase", color:"var(--accent)", marginBottom:10,
  },
  heading  : { fontSize:30, fontWeight:700, color:"#1a1a2e", marginBottom:8, fontFamily:"'Playfair Display', serif" },
  sub      : { fontSize:14, color:"#6b7280", marginBottom:32, lineHeight:1.6 },
  field    : { marginBottom:18 },
  label    : { display:"block", fontSize:13, fontWeight:500, color:"#1a1a2e", marginBottom:7 },
  fieldRow : { position:"relative" },
  input    : (focused, error, disabled) => ({
    width:"100%", padding:"12px 14px",
    border:`1.5px solid ${error ? "#dc2626" : focused ? "var(--accent)" : "#e5e0d5"}`,
    borderRadius:8, fontSize:14, color:"#1a1a2e",
    fontFamily:"'DM Sans', sans-serif",
    background: disabled ? "#f3f4f6" : "#fff",
    outline:"none", boxSizing:"border-box",
    boxShadow: focused && !error ? "0 0 0 3px rgba(var(--accent-rgb),0.12)" : "none",
    cursor: disabled ? "not-allowed" : "text",
  }),
  fieldErr : { fontSize:12, color:"#dc2626", marginTop:5 },
  fieldHint: { fontSize:11, color:"#6b7280", marginTop:5 },
  divider  : { display:"flex", alignItems:"center", gap:12, margin:"20px 0", color:"#6b7280", fontSize:12 },
  divLine  : { flex:1, height:1, background:"#e5e0d5" },
  btn      : (disabled) => ({
    width:"100%", padding:13, background: disabled ? "#9ca3af" : "var(--primary)",
    color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600,
    fontFamily:"'DM Sans', sans-serif",
    cursor: disabled ? "not-allowed" : "pointer",
    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
    transition:"background 0.2s",
  }),
  footerNote: { marginTop:24, fontSize:11, color:"#6b7280", textAlign:"center", lineHeight:1.6 },
  footerLink: { color:"var(--accent)", textDecoration:"none" },
  lockWrap : {
    position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
    color:"#d1d5db", pointerEvents:"none",
  },
  tickWrap : {
    position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
    width:20, height:20, background:"#ecfdf5", border:"1px solid #6ee7b7",
    borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
  },
  otpBox   : {
    display:"flex", gap:10, justifyContent:"center", margin:"8px 0 4px",
  },
  otpInput : (focused) => ({
    width:48, height:56, textAlign:"center", fontSize:22, fontWeight:700,
    fontFamily:"'DM Sans', sans-serif",
    border:`1.5px solid ${focused ? "var(--accent)" : "#e5e0d5"}`,
    borderRadius:8, outline:"none", color:"#1a1a2e",
    boxShadow: focused ? "0 0 0 3px rgba(var(--accent-rgb),0.12)" : "none",
  }),
};

const STEPS = { CODE: "code", EMAIL: "email", OTP: "otp" };

export default function Login() {
  const { tenant }    = useTenant();
  const { login }     = useAuth();
  const navigate      = useNavigate();
  const hostname      = window.location.hostname;

  const requiresCode  = tenant?.requiresCode ?? false;

  const [step, setStep]           = useState(requiresCode ? STEPS.CODE : STEPS.EMAIL);
  const [code, setCode]           = useState("");
  const [codeOk, setCodeOk]       = useState(!requiresCode);
  const [codeErr, setCodeErr]     = useState("");
  const [email, setEmail]         = useState("");
  const [emailFocus, setEmailFocus] = useState(false);
  const [emailErr, setEmailErr]   = useState("");
  const [otp, setOtp]             = useState(["","","","","",""]);
  const [otpFocus, setOtpFocus]   = useState(null);
  const [otpErr, setOtpErr]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [resendCd, setResendCd]   = useState(0);

  // ── Access code ───────────────────────────────────────────
  function handleCodeChange(val) {
    setCode(val);
    setCodeErr("");
    const expected = tenant?.accessCode || "";
    if (val.trim().toUpperCase() === expected.toUpperCase() && expected) {
      setCodeOk(true);
      setStep(STEPS.EMAIL);
    } else {
      setCodeOk(false);
    }
  }

  // ── Email submit → request OTP ────────────────────────────
  async function handleEmailSubmit() {
    const trimmed = email.trim();
    const parts   = trimmed.split("@");
    const valid   = parts.length === 2 && parts[0].length > 0 && parts[1].indexOf(".") > 0;
    if (!valid) { setEmailErr("Please enter a valid email address."); return; }

    setLoading(true);
    setEmailErr("");
    try {
      await requestOTP(trimmed, hostname, code);
      setStep(STEPS.OTP);
      startResendCooldown();
    } catch (e) {
      setEmailErr(e.response?.data?.detail || "Could not send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── OTP input ─────────────────────────────────────────────
  function handleOtpChange(idx, val) {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[idx]  = val.slice(-1);
    setOtp(next);
    setOtpErr("");
    if (val && idx < 5) {
      document.getElementById(`otp-${idx+1}`)?.focus();
    }
  }

  function handleOtpKeyDown(idx, e) {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      document.getElementById(`otp-${idx-1}`)?.focus();
    }
  }

  // ── OTP submit → verify ───────────────────────────────────
  async function handleOtpSubmit() {
    const code6 = otp.join("");
    if (code6.length < 6) { setOtpErr("Please enter the full 6-digit code."); return; }

    setLoading(true);
    setOtpErr("");
    try {
      const res = await verifyOTP(email.trim(), hostname, code6);
      login(res.data.token, {
        email  : res.data.email,
        plan   : res.data.plan,
        credits: res.data.credits,
        role   : res.data.role,
      });
      navigate("/", { replace: true });
    } catch (e) {
      setOtpErr(e.response?.data?.detail || "Incorrect or expired code. Please try again.");
      setOtp(["","","","","",""]);
      document.getElementById("otp-0")?.focus();
    } finally {
      setLoading(false);
    }
  }

  function startResendCooldown() {
    setResendCd(30);
    const t = setInterval(() => {
      setResendCd((c) => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; });
    }, 1000);
  }

  async function handleResend() {
    if (resendCd > 0) return;
    setLoading(true);
    try {
      await requestOTP(email.trim(), hostname, code);
      setOtp(["","","","","",""]);
      setOtpErr("");
      startResendCooldown();
    } catch (e) {
      setOtpErr("Could not resend code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={S.wrapper}>

      {/* LEFT PANEL */}
      <div style={S.left}>
        <div style={S.accentBar} />
        <div style={S.ring1} />
        <div style={S.ring2} />

        <div style={{ position:"relative", zIndex:2 }}>
          {tenant?.logoUrl && (
            <div style={{ marginBottom:28 }}>
              <img src={tenant.logoUrl} alt={tenant.clientName}
                   style={{ height:36, width:"auto", objectFit:"contain" }} />
            </div>
          )}
          <div style={S.heroLabel}>Credit Risk Intelligence</div>
          <h1 style={S.heroHeading}>
            Analyse listings.<br/>
            Score clients.<br/>
            <span style={{ color:"var(--accent)" }}>In seconds.</span>
          </h1>
          <p style={S.heroSub}>
            Analyse your Commercial Paper and Promissory Note listings in 4 quick steps.
            Cut your credit risk analysis time in half.
          </p>
          <div style={S.statStrip}>
            <div style={S.stat}><div style={S.statVal}>4</div><div style={S.statLbl}>Simple steps</div></div>
            <div style={S.stat}><div style={S.statVal}>10</div><div style={S.statLbl}>Ratio metrics</div></div>
            <div style={S.stat}><div style={S.statVal}>~60s</div><div style={S.statLbl}>Per assessment</div></div>
          </div>
          <div style={S.steps}>
            {[
              ["Upload financial statement",  "AI extracts all key figures automatically"],
              ["Review & confirm data",        "Verify AI-extracted figures in one screen"],
              ["View computed scores",         "10 quantitative ratios scored instantly"],
              ["Generate PDF report",          "Professional report ready to share"],
            ].map(([title, sub], i) => (
              <div key={i} style={S.step}>
                <div style={S.stepNum}>{i+1}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:"rgba(255,255,255,0.9)", marginBottom:1 }}>{title}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position:"relative", zIndex:2, marginTop:20, paddingTop:16, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.25)" }}>
            Powered by <span style={{ color:"rgba(255,255,255,0.4)" }}>SmartRisk Sheets Technologies Limited</span>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={S.right}>
        <div style={S.card}>
          <div style={S.eyebrow}>{tenant?.loginEyebrow || "Analyst Portal"}</div>
          <h2 style={S.heading}>Welcome back</h2>
          <p style={S.sub}>{tenant?.loginSubtext || "Sign in to access your credit risk assessment tool."}</p>

          {/* ACCESS CODE STEP */}
          {step === STEPS.CODE && (
            <>
              <div style={S.field}>
                <label style={S.label}>Access Code</label>
                <div style={S.fieldRow}>
                  <input
                    style={S.input(false, !!codeErr, false)}
                    type="text"
                    placeholder="Enter your access code"
                    value={code}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCodeChange(code)}
                    autoFocus
                  />
                  {codeOk && (
                    <div style={S.tickWrap}>
                      <Check size={11} color="#065f46" strokeWidth={2.5} />
                    </div>
                  )}
                </div>
                {codeErr && <div style={S.fieldErr}>{codeErr}</div>}
                <div style={S.fieldHint}>Enter your access code to unlock the email field.</div>
              </div>
            </>
          )}

          {/* EMAIL STEP */}
          {step === STEPS.EMAIL && (
            <>
              {requiresCode && codeOk && (
                <div style={{ ...S.field, marginBottom:8 }}>
                  <div style={{ fontSize:12, color:"#065f46", background:"#ecfdf5",
                    border:"1px solid #6ee7b7", borderRadius:6, padding:"8px 12px" }}>
                    ✓ Access code accepted
                  </div>
                </div>
              )}
              <div style={S.field}>
                <label style={S.label}>Email Address</label>
                <div style={S.fieldRow}>
                  <input
                    style={S.input(emailFocus, !!emailErr, false)}
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailErr(""); }}
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
                    onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                    autoFocus
                  />
                </div>
                {emailErr && <div style={S.fieldErr}>{emailErr}</div>}
              </div>
              <button
                style={S.btn(loading || !email.trim())}
                onClick={handleEmailSubmit}
                disabled={loading || !email.trim()}
              >
                {loading ? <Loader size={16} style={{ animation:"spin 0.8s linear infinite" }} /> : "Continue →"}
              </button>
            </>
          )}

          {/* OTP STEP */}
          {step === STEPS.OTP && (
            <>
              <div style={{ fontSize:14, color:"#6b7280", marginBottom:20, lineHeight:1.6 }}>
                We sent a 6-digit code to <strong style={{ color:"#1a1a2e" }}>{email}</strong>.
                Enter it below.
              </div>
              <div style={S.otpBox}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    id={`otp-${idx}`}
                    style={S.otpInput(otpFocus === idx)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onFocus={() => setOtpFocus(idx)}
                    onBlur={() => setOtpFocus(null)}
                    autoFocus={idx === 0}
                  />
                ))}
              </div>
              {otpErr && <div style={{ ...S.fieldErr, textAlign:"center", marginBottom:12 }}>{otpErr}</div>}
              <button
                style={{ ...S.btn(loading || otp.join("").length < 6), marginTop:16 }}
                onClick={handleOtpSubmit}
                disabled={loading || otp.join("").length < 6}
              >
                {loading
                  ? <Loader size={16} style={{ animation:"spin 0.8s linear infinite" }} />
                  : "Verify & Sign In"
                }
              </button>
              <div style={{ textAlign:"center", marginTop:16, fontSize:12, color:"#6b7280" }}>
                Didn't receive it?{" "}
                <span
                  onClick={handleResend}
                  style={{ color: resendCd > 0 ? "#9ca3af" : "var(--accent)", cursor: resendCd > 0 ? "default" : "pointer", fontWeight:500 }}
                >
                  {resendCd > 0 ? `Resend in ${resendCd}s` : "Resend code"}
                </span>
                {" · "}
                <span
                  onClick={() => { setStep(STEPS.EMAIL); setOtp(["","","","","",""]); setOtpErr(""); }}
                  style={{ color:"var(--accent)", cursor:"pointer", fontWeight:500 }}
                >
                  Change email
                </span>
              </div>
            </>
          )}

          <div style={S.footerNote}>
            Don't have an account?{" "}
            <a href="/register" style={S.footerLink}>Create one free →</a>
            <br /><br />
            <a href={`mailto:${tenant?.adminEmail || "info@smartrisksheets.com"}`} style={S.footerLink}>
              Request access
            </a>
            {" · "}
            <a href="mailto:support@smartrisksheets.com" style={S.footerLink}>
              Support
            </a>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}