import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader, Check } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export default function Register() {
  const { tenant } = useTenant();
  const hostname   = window.location.hostname;

  const [form, setForm]         = useState({ name:"", email:"", company:"" });
  const [errors, setErrors]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [globalErr, setGlobalErr] = useState("");

  function set(k, v) {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(p => ({ ...p, [k]: "" }));
    setGlobalErr("");
  }

  function validate() {
    const e = {};
    if (!form.name.trim())  e.name  = "Name is required.";
    if (!form.email.trim()) e.email = "Email is required.";
    else {
      const parts = form.email.split("@");
      if (parts.length !== 2 || !parts[0] || parts[1].indexOf(".") < 0)
        e.email = "Enter a valid email address.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setGlobalErr("");
    try {
      const res = await axios.post(`${BASE_URL}/auth/register`, {
        name    : form.name.trim(),
        email   : form.email.trim().toLowerCase(),
        company : form.company.trim() || null,
        hostname,
      });
      if (res.data.already_verified) {
        setGlobalErr("This email is already registered. Please sign in instead.");
      } else {
        setDone(true);
      }
    } catch (e) {
      const detail = e.response?.data?.detail;
      setGlobalErr(typeof detail === "string" ? detail : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inp = (err) => ({
    width:"100%", padding:"11px 14px", fontSize:13, color:"#1a1a2e",
    border:`1.5px solid ${err ? "#dc2626" : "#e5e0d5"}`,
    borderRadius:8, background:"#fff", outline:"none", boxSizing:"border-box",
  });

  const btn = (dis) => ({
    width:"100%", padding:12, fontSize:14, fontWeight:600,
    background: dis ? "#9ca3af" : "var(--primary)",
    color:"#fff", border:"none", borderRadius:8,
    cursor: dis ? "not-allowed" : "pointer",
    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
  });

  return (
    <div style={{ display:"flex", height:"100vh", width:"100vw", overflow:"hidden" }}>

      {/* LEFT */}
      <div style={{ flex:"0 0 55%", background:"var(--primary)", position:"relative", display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"32px 48px", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, left:0, width:4, height:"100%", background:"var(--accent)" }} />
        <div style={{ position:"absolute", width:600, height:600, borderRadius:"50%", border:"1px solid rgba(var(--accent-rgb),0.12)", top:-180, right:-180 }} />
        <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%", border:"1px solid rgba(var(--accent-rgb),0.08)", bottom:-100, left:-100 }} />

        <div style={{ position:"relative", zIndex:2 }}>
          {tenant?.logoUrl && (
            <img src={tenant.logoUrl} alt={tenant.clientName}
                 style={{ height:36, width:"auto", objectFit:"contain", marginBottom:28 }} />
          )}
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--accent)", border:"1px solid rgba(var(--accent-rgb),0.3)", padding:"5px 12px", borderRadius:20, display:"inline-block", marginBottom:14 }}>
            Commercial Paper Assessment
          </div>
          <h1 style={{ fontSize:28, fontWeight:700, color:"#fff", lineHeight:1.2, marginBottom:14, fontFamily:"'Playfair Display', serif" }}>
            Start assessing.<br />
            <span style={{ color:"var(--accent)" }}>In minutes.</span>
          </h1>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.55)", lineHeight:1.7, maxWidth:360, marginBottom:24 }}>
            Create your account and get 2 free assessment credits — no card required.
          </p>
          {[
            "Lightening fast financial statement extraction",
            "10-ratio quantitative scoring model",
            "Professional PDF report generation",
            "Nigerian capital markets calibrated",
          ].map((f, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <div style={{ width:20, height:20, borderRadius:"50%", background:"rgba(var(--accent-rgb),0.2)", border:"1px solid rgba(var(--accent-rgb),0.4)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Check size={11} color="var(--accent)" strokeWidth={2.5} />
              </div>
              <span style={{ fontSize:13, color:"rgba(255,255,255,0.75)" }}>{f}</span>
            </div>
          ))}
        </div>

        <div style={{ position:"relative", zIndex:2, fontSize:11, color:"rgba(255,255,255,0.25)", marginTop:20, paddingTop:16, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          Powered by <span style={{ color:"rgba(255,255,255,0.4)" }}>SmartRisk Sheets Technologies Limited</span>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"48px 56px", background:"#f9f6ef", overflowY:"auto" }}>
        <div style={{ width:"100%", maxWidth:400 }}>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--accent)", marginBottom:10 }}>
            {tenant?.loginEyebrow || "Analyst Portal"}
          </div>

          {done ? (
            <div style={{ background:"#ecfdf5", border:"1px solid #6ee7b7", borderRadius:8, padding:"28px 24px", textAlign:"center" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📬</div>
              <h3 style={{ fontSize:16, fontWeight:"bold", color:"#065f46", marginBottom:8 }}>Check your inbox</h3>
              <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.65 }}>
                We sent a verification link to <strong>{form.email}</strong>.<br />
                Click the link to activate your account and receive 2 free credits.
              </p>
              <p style={{ fontSize:12, color:"#888", marginTop:12 }}>
                Didn't receive it? Check spam or{" "}
                <span style={{ color:"var(--accent)", cursor:"pointer" }} onClick={() => setDone(false)}>
                  try again
                </span>.
              </p>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize:26, fontWeight:700, color:"#1a1a2e", marginBottom:8, fontFamily:"'Playfair Display', serif" }}>
                Create your account
              </h2>
              <p style={{ fontSize:13, color:"#6b7280", marginBottom:28, lineHeight:1.6 }}>
                Get 2 free assessment credits on signup. No credit card required.
              </p>

              {globalErr && (
                <div style={{ padding:"10px 14px", borderRadius:6, fontSize:13, background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", marginBottom:16 }}>
                  {globalErr}
                </div>
              )}

              <div style={{ marginBottom:16 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:500, color:"#1a1a2e", marginBottom:6 }}>Full Name *</label>
                <input style={inp(errors.name)} type="text" placeholder="e.g. Chidi Okonkwo"
                  value={form.name} onChange={e => set("name", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()} autoFocus />
                {errors.name && <div style={{ fontSize:12, color:"#dc2626", marginTop:4 }}>{errors.name}</div>}
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:500, color:"#1a1a2e", marginBottom:6 }}>Work Email *</label>
                <input style={inp(errors.email)} type="email" placeholder="you@company.com"
                  value={form.email} onChange={e => set("email", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()} />
                {errors.email && <div style={{ fontSize:12, color:"#dc2626", marginTop:4 }}>{errors.email}</div>}
                <div style={{ fontSize:11, color:"#6b7280", marginTop:4 }}>Disposable email addresses are not accepted.</div>
              </div>

              <div style={{ marginBottom:20 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:500, color:"#1a1a2e", marginBottom:6 }}>
                  Company <span style={{ color:"#9ca3af", fontWeight:400 }}>(optional)</span>
                </label>
                <input style={inp(false)} type="text" placeholder="e.g. Rockwell Finance"
                  value={form.company} onChange={e => set("company", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()} />
              </div>

              <button style={btn(loading || !form.name || !form.email)}
                onClick={handleSubmit} disabled={loading || !form.name || !form.email}>
                {loading
                  ? <Loader size={16} style={{ animation:"spin 0.8s linear infinite" }} />
                  : "Create Account →"}
              </button>

              <div style={{ marginTop:20, fontSize:12, color:"#6b7280", textAlign:"center" }}>
                Already have an account?{" "}
                <Link to="/login" style={{ color:"var(--accent)", textDecoration:"none", fontWeight:500 }}>Sign in</Link>
              </div>

              <div style={{ marginTop:12, fontSize:11, color:"#9ca3af", textAlign:"center", lineHeight:1.6 }}>
                By creating an account you agree to our{" "}
                <a href="https://smartrisksheets.com/terms" target="_blank" rel="noreferrer" style={{ color:"var(--accent)" }}>Terms</a>
                {" & "}
                <a href="https://smartrisksheets.com/privacy" target="_blank" rel="noreferrer" style={{ color:"var(--accent)" }}>Privacy Policy</a>.
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
