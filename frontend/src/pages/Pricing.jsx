import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { getQuotaStatus } from "../api/client.js";
import { Loader, Zap, ArrowLeft } from "lucide-react";
import axios from "axios";

const BASE_URL        = import.meta.env.VITE_API_BASE_URL || "";
const PAYSTACK_PK     = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

const PACK_COLORS = {
  starter     : { accent:"#01b88e", bg:"#f0fdf9" },
  standard    : { accent:"#1F2854", bg:"#f0f4ff" },
  professional: { accent:"#C8A217", bg:"#fffbeb" },
  team        : { accent:"#7c3aed", bg:"#f5f3ff" },
};

export default function Pricing() {
  const { user }   = useAuth();
  const { tenant } = useTenant();
  const navigate   = useNavigate();
  const hostname   = window.location.hostname;

  const [packs, setPacks]     = useState([]);
  const [quota, setQuota]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState(null);
  const [error, setError]     = useState("");

  useEffect(() => {
    Promise.all([
      axios.get(`${BASE_URL}/payments/packs`).then(r => ({ data: Array.isArray(r.data) ? r.data : [] })),
      user ? getQuotaStatus() : Promise.resolve(null),
    ]).then(([packsRes, quotaRes]) => {
      setPacks(packsRes.data);
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
        { headers: { Authorization: `Bearer ${localStorage.getItem("sr_token")}` } }
      );
      // Redirect to Paystack checkout
      window.location.href = res.data.authorization_url;
    } catch (e) {
      setError(e.response?.data?.detail || "Payment initialization failed. Please try again.");
      setPaying(null);
    }
  }

  const css = {
    page    : { minHeight:"100vh", background:"#F5F5F2", paddingBottom:60 },
    header  : { background:"var(--primary)", padding:"14px 32px", display:"flex", alignItems:"center", justifyContent:"space-between" },
    back    : { display:"flex", alignItems:"center", gap:6, color:"#ccc", fontSize:13, cursor:"pointer", background:"none", border:"none", fontFamily:"Arial,sans-serif" },
    hero    : { textAlign:"center", padding:"48px 24px 32px" },
    grid    : { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:20, maxWidth:960, margin:"0 auto", padding:"0 24px" },
    card    : (accent, bg, popular) => ({
      background:"#fff", borderRadius:12, padding:28,
      border: popular ? `2px solid ${accent}` : "1px solid #E0E0E0",
      position:"relative", boxShadow: popular ? `0 4px 24px rgba(0,0,0,0.08)` : "none",
    }),
    badge   : (accent) => ({ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:accent, color:"#fff", fontSize:11, fontWeight:700, padding:"3px 12px", borderRadius:999, whiteSpace:"nowrap" }),
    btn     : (accent, dis) => ({ width:"100%", padding:"11px 0", background: dis ? "#D0D0D0" : accent, color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:600, cursor: dis ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:20 }),
    freeBox : { maxWidth:480, margin:"32px auto 0", background:"#fff", border:"1px solid #E0E0E0", borderRadius:10, padding:"20px 24px", textAlign:"center" },
  };

  return (
    <div style={css.page}>
      <div style={css.header}>
        <button style={css.back} onClick={() => navigate(user ? "/" : "/login")}>
          <ArrowLeft size={14} /> {user ? "Back to App" : "Sign In"}
        </button>
        <div style={{ color:"var(--accent)", fontSize:15, fontWeight:"bold" }}>SmartRisk Credit</div>
        {quota && (
          <div style={{ fontSize:12, color:"#aaa" }}>
            Balance: <strong style={{ color:"var(--accent)" }}>{quota.credits} credits</strong>
          </div>
        )}
      </div>

      <div style={css.hero}>
        <h1 style={{ fontSize:32, fontWeight:700, color:"var(--primary)", marginBottom:8, fontFamily:"'Playfair Display', serif" }}>
          Buy Assessment Credits
        </h1>
        <p style={{ fontSize:15, color:"#5A5A5A", maxWidth:520, margin:"0 auto" }}>
          One credit = one full assessment. Credits valid for 12 months from purchase.
        </p>
      </div>

      {error && (
        <div style={{ maxWidth:480, margin:"0 auto 20px", padding:"10px 16px", background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", borderRadius:6, fontSize:13, textAlign:"center" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:"center", padding:40 }}>
          <Loader size={28} style={{ animation:"spin 0.8s linear infinite", color:"var(--accent)" }} />
        </div>
      ) : (
        <div style={css.grid}>
          {packs.map((pack, i) => {
            const colors  = PACK_COLORS[pack.key] || { accent:"var(--primary)", bg:"#fff" };
            const popular = pack.key === "standard";
            const busy    = paying === pack.key;

            return (
              <div key={pack.key} style={css.card(colors.accent, colors.bg, popular)}>
                {popular && <div style={css.badge(colors.accent)}>Most Popular</div>}

                <div style={{ fontSize:13, fontWeight:700, color:colors.accent, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>
                  {pack.label}
                </div>
                <div style={{ fontSize:36, fontWeight:700, color:"var(--primary)", marginBottom:4 }}>
                  {pack.credits}
                  <span style={{ fontSize:16, fontWeight:400, color:"#888" }}> credits</span>
                </div>
                <div style={{ fontSize:22, fontWeight:700, color:colors.accent, marginBottom:4 }}>
                  ₦{pack.amount_naira.toLocaleString()}
                </div>
                <div style={{ fontSize:12, color:"#888", marginBottom:16 }}>
                  ₦{pack.per_credit.toLocaleString()} per assessment
                </div>
                <div style={{ fontSize:12, color:"#5A5A5A", lineHeight:1.6 }}>
                  ✓ Valid for 12 months<br />
                  ✓ Card, bank transfer, USSD<br />
                  ✓ Instant credit top-up
                </div>

                <button
                  style={css.btn(colors.accent, busy || !!paying)}
                  onClick={() => handleBuy(pack.key)}
                  disabled={busy || !!paying}
                >
                  {busy
                    ? <><Loader size={14} style={{ animation:"spin 0.8s linear infinite" }} /> Processing...</>
                    : <><Zap size={14} /> Buy {pack.credits} Credits</>
                  }
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={css.freeBox}>
        <div style={{ fontSize:13, fontWeight:"bold", color:"var(--primary)", marginBottom:6 }}>
          New to SmartRisk Credit?
        </div>
        <div style={{ fontSize:13, color:"#5A5A5A", marginBottom:12 }}>
          Create a free account and get 2 assessment credits — no card required.
        </div>
        <button onClick={() => navigate("/register")}
          style={{ padding:"9px 24px", background:"var(--primary)", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
          Start Free →
        </button>
      </div>

      <div style={{ textAlign:"center", marginTop:32, fontSize:11, color:"#888" }}>
        All payments processed securely by Paystack &bull; SmartRisk Sheets Technologies Limited (RC: 9170218)
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}