import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { getQuotaStatus } from "../api/client.js";
import { Loader, ArrowLeft, Check, Mail, MessageCircle, X } from "lucide-react";
import axios from "axios";

const BASE_URL    = import.meta.env.VITE_API_BASE_URL || "";
const PAYSTACK_PK = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

// ── Static pack definitions ────────────────────────────────────
const PACK_STATIC = {
  starter: {
    popular  : false,
    btnLabel : "Buy Starter Pack",
    features : [
      "Everything in Free Trial",
      "Rating report extraction",
      "CP indicative terms extraction",
      "Preview & edit AI narrative",
      "Credits valid for 12 months",
    ],
  },
  standard: {
    popular  : true,
    btnLabel : "Buy Standard Pack",
    features : [
      "Everything in Starter",
      "Priority email support",
      "Assessment history log",
      "Credits valid for 12 months",
      "Save 10% vs Starter rate",
    ],
  },
  professional: {
    popular  : false,
    btnLabel : "Buy Professional Pack",
    features : [
      "Everything in Standard",
      "Early access to new features",
      "Dedicated account support",
      "Credits valid for 12 months",
      "Save 17.5% vs Starter rate",
    ],
  },
};

const PACK_ORDER = ["starter", "standard", "professional"];

const C = {
  navy    : "#1F2854",
  emerald : "#01b88e",
  cream   : "#F5F5F2",
  border  : "#E0E0E0",
  grey    : "#5A5A5A",
  muted   : "#888",
};

export default function Pricing() {
  const { user }   = useAuth();
  const { tenant } = useTenant();
  const navigate   = useNavigate();
  const hostname   = window.location.hostname;

  const [packs,       setPacks]       = useState([]);
  const [quota,       setQuota]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [paying,      setPaying]      = useState(null);
  const [error,       setError]       = useState("");
  const [showContact, setShowContact] = useState(false);

  useEffect(() => {
    Promise.all([
      axios.get(`${BASE_URL}/payments/packs`),
      user ? getQuotaStatus() : Promise.resolve(null),
    ]).then(([packsRes, quotaRes]) => {
      setPacks(packsRes.data.filter(p => PACK_ORDER.includes(p.key)));
      if (quotaRes) setQuota(quotaRes.data);
    }).catch(() => setError("Failed to load pricing. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  async function handleBuy(packKey) {
    if (!user) { navigate("/login"); return; }
    setPaying(packKey);
    setError("");
    try {
      const res = await axios.post(
        `${BASE_URL}/payments/initialize`,
        { pack: packKey, hostname },
        { headers: { Authorization: `Bearer ${localStorage.getItem("sr_token")}` } },
      );
      window.location.href = res.data.authorization_url;
    } catch (e) {
      setError(e.response?.data?.detail || "Payment initialization failed. Please try again.");
      setPaying(null);
    }
  }

  return (
    <div style={{ minHeight:"100vh", background:C.cream, paddingBottom:60, fontFamily:"Arial,sans-serif" }}>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <div style={{ background:C.navy, padding:"14px 32px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <button
          onClick={() => navigate(user ? "/" : "/login")}
          style={{ display:"flex", alignItems:"center", gap:6, color:"#ccc", fontSize:13, cursor:"pointer", background:"none", border:"none", fontFamily:"Arial,sans-serif" }}
        >
          <ArrowLeft size={14} /> {user ? "Back to App" : "Sign In"}
        </button>
        <div style={{ color:C.emerald, fontSize:15, fontWeight:"bold" }}>SmartRisk Credit</div>
        {quota && (
          <div style={{ fontSize:12, color:"#aaa" }}>
            Balance: <strong style={{ color:C.emerald }}>{quota.credits} credits</strong>
          </div>
        )}
        {!quota && <div style={{ width:80 }} />}
      </div>

      {/* ── Hero ── */}
      <div style={{ textAlign:"center", padding:"48px 24px 32px" }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:C.emerald, marginBottom:12 }}>
          Pricing
        </div>
        <h1 style={{ fontSize:36, fontWeight:700, color:C.navy, marginBottom:12, fontFamily:"Georgia,serif", lineHeight:1.2 }}>
          Simple, transparent pricing.
        </h1>
        <p style={{ fontSize:15, color:C.grey, maxWidth:480, margin:"0 auto", lineHeight:1.7 }}>
          Looks like you're finding it useful. <br></>Pick a pack and keep your assessments running.
        </p>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ maxWidth:760, margin:"0 auto 20px", padding:"10px 16px", background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", borderRadius:6, fontSize:13, textAlign:"center" }}>
          {error}
        </div>
      )}

      {/* ── Cards ── */}
      {loading ? (
        <div style={{ textAlign:"center", padding:40 }}>
          <Loader size={28} style={{ animation:"spin 0.8s linear infinite", color:C.emerald }} />
        </div>
      ) : null}
      {!loading && <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20, maxWidth:960, margin:"0 auto", padding:"0 24px" }}>
        {packs.sort((a,b) => PACK_ORDER.indexOf(a.key) - PACK_ORDER.indexOf(b.key)).map((pack) => {
          const key  = pack.key;
          const s    = PACK_STATIC[key] || {};
          const m    = {
            ...s,
            label    : pack.label,
            price    : `₦${pack.amount_naira.toLocaleString()}`,
            credits  : `${pack.credits} credits`,
            perCredit: `₦${pack.per_credit.toLocaleString()} per assessment`,
            note     : "Access granted immediately after payment",
          };
          const busy = paying === key;

          return (
            <div key={key} style={{
              background    : "#fff",
              borderRadius  : 12,
              padding       : 28,
              border        : m.popular ? `2px solid ${C.emerald}` : `1px solid ${C.border}`,
              position      : "relative",
              boxShadow     : m.popular ? "0 4px 24px rgba(0,0,0,0.09)" : "none",
              display       : "flex",
              flexDirection : "column",
            }}>

              {/* Popular badge */}
              {m.popular && (
                <div style={{ position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)", background:C.emerald, color:"#fff", fontSize:11, fontWeight:700, padding:"3px 14px", borderRadius:999, whiteSpace:"nowrap" }}>
                  Most popular
                </div>
              )}

              {/* Pack name */}
              <div style={{ fontSize:15, fontWeight:700, color:C.navy, marginBottom:14 }}>
                {m.label}
              </div>

              {/* Price */}
              <div style={{ marginBottom:4 }}>
                <span style={{ fontSize:28, fontWeight:700, color:C.navy }}>{m.price}</span>
                <span style={{ fontSize:13, color:C.muted, marginLeft:4 }}>{m.suffix}</span>
              </div>

              {/* Credits + per assessment */}
              <div style={{ fontSize:12, color:C.emerald, fontWeight:600, marginBottom:20 }}>
                {m.credits} &nbsp;&middot;&nbsp; {m.perCredit}
              </div>

              <hr style={{ border:"none", borderTop:`1px solid ${C.border}`, marginBottom:18 }} />

              {/* Features */}
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
                {m.features.map((f, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:13, color:C.grey, lineHeight:1.5 }}>
                    <Check size={13} color={C.emerald} style={{ flexShrink:0, marginTop:2 }} />
                    {f}
                  </div>
                ))}
              </div>

              {/* Button */}
              <button
                onClick={() => handleBuy(key)}
                disabled={!!paying}
                style={{
                  width      : "100%",
                  padding    : "11px 0",
                  borderRadius: 8,
                  fontSize   : 14,
                  fontWeight : 600,
                  cursor     : paying ? "not-allowed" : "pointer",
                  fontFamily : "Arial,sans-serif",
                  display    : "flex",
                  alignItems : "center",
                  justifyContent: "center",
                  gap        : 6,
                  transition : "opacity 0.15s",
                  ...(m.popular
                    ? { background: paying ? "#ccc" : C.emerald, color:"#fff", border:"none" }
                    : { background:"#fff", color: paying ? C.muted : C.navy, border:`1.5px solid ${paying ? C.border : C.navy}` }
                  ),
                }}
              >
                {busy
                  ? <><Loader size={14} style={{ animation:"spin 0.8s linear infinite" }} /> Processing...</>
                  : m.btnLabel
                }
              </button>

              {/* Note */}
              <div style={{ fontSize:11, color:C.muted, textAlign:"center", marginTop:10 }}>
                {m.note}
              </div>
            </div>
          );
        })}
      </div>}

      {/* ── Enterprise ── */}
      <div style={{ maxWidth:960, margin:"24px auto 0", padding:"0 24px" }}>
        <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:"24px 32px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:24, flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:260 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.navy, marginBottom:8 }}>Enterprise</div>
            <div style={{ fontSize:13, color:C.grey, lineHeight:1.7 }}>
              Unlimited assessments &middot; Team accounts &middot; Approval workflow &middot; Custom branded reports &middot;
              Dedicated subdomain &middot; SLA &middot; Full audit trail. For PFAs, investment banks, and multi-team risk operations.
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8, flexShrink:0 }}>
            <div style={{ fontSize:13, color:C.muted, fontWeight:600 }}>Custom pricing</div>
            <button
              onClick={() => setShowContact(true)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 20px", background:"#fff", color:C.navy, border:`1.5px solid ${C.navy}`, borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Arial,sans-serif" }}
            >
              <Mail size={13} /> Contact us →
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign:"center", marginTop:32, fontSize:12, color:C.muted, lineHeight:1.8, padding:"0 24px" }}>
        Payments processed securely via Paystack. Credit packs are one-time purchases — no subscription, no auto-renewal.<br />
        Credits are valid for 12 months. Questions?{" "}
        <button onClick={() => setShowContact(true)} style={{ background:"none", border:"none", color:C.emerald, fontSize:12, cursor:"pointer", textDecoration:"underline", padding:0, fontFamily:"Arial,sans-serif" }}>
          Get in touch
        </button>
      </div>

      {/* ── Contact modal ── */}
      {showContact && (
        <div onClick={(e) => e.target === e.currentTarget && setShowContact(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ background:"#fff", borderRadius:12, width:"100%", maxWidth:420, padding:"32px 28px", position:"relative", boxShadow:"0 24px 80px rgba(0,0,0,0.25)", textAlign:"center" }}>
            <button onClick={() => setShowContact(false)} style={{ position:"absolute", top:14, right:18, background:"none", border:"none", cursor:"pointer", color:"#888" }}>
              <X size={18} />
            </button>
            <div style={{ fontSize:17, fontWeight:"bold", color:C.navy, marginBottom:6 }}>Get in touch</div>
            <div style={{ fontSize:13, color:"#888", marginBottom:28 }}>Choose how you'd like to reach us.</div>
            <div style={{ display:"flex", gap:16, justifyContent:"center", marginBottom:20 }}>
              <a href="mailto:info@smartrisksheets.com"
                style={{ flex:1, maxWidth:160, display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"20px 16px", border:"1px solid #E0E0E0", borderRadius:10, textDecoration:"none", background:"#fff", transition:"all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#01b88e"; e.currentTarget.style.background="#f0faf7"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#E0E0E0"; e.currentTarget.style.background="#fff"; }}>
                <Mail size={28} color={C.navy} strokeWidth={1.5} />
                <div style={{ fontSize:13, fontWeight:"bold", color:C.navy }}>Email us</div>
                <div style={{ fontSize:11, color:"#888" }}>info@smartrisksheets.com</div>
              </a>
              <a href="https://wa.me/2349052288923" target="_blank" rel="noreferrer"
                style={{ flex:1, maxWidth:160, display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"20px 16px", border:"1px solid #E0E0E0", borderRadius:10, textDecoration:"none", background:"#fff", transition:"all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#25D366"; e.currentTarget.style.background="#f0fdf4"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#E0E0E0"; e.currentTarget.style.background="#fff"; }}>
                <MessageCircle size={28} color="#25D366" strokeWidth={1.5} />
                <div style={{ fontSize:13, fontWeight:"bold", color:C.navy }}>WhatsApp</div>
                <div style={{ fontSize:11, color:"#888" }}>SmartRisk</div>
              </a>
            </div>
            <div style={{ fontSize:11, color:"#aaa", lineHeight:1.7 }}>
              WhatsApp for quick help · Email for account and billing queries<br />
              We typically respond within a few hours on business days.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
