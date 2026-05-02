import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader, CheckCircle, AlertTriangle, Mail, MessageCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { generateReport } from "../api/client.js";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const navigate        = useNavigate();
  const reference       = searchParams.get("reference") || searchParams.get("trxref");

  const [status, setStatus]   = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!reference) { setStatus("error"); setMessage("No payment reference found."); return; }

    const token = localStorage.getItem("sr_token");
    if (!token) { setStatus("error"); setMessage("You must be logged in to verify payment."); return; }
    axios.get(`${BASE_URL}/payments/verify/${reference}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => {
        if (res.data.ok) {
          setStatus("success");
          setMessage(`${res.data.credits_added} credits have been added to your account.`);
          refreshUser().catch(() => {});
          setTimeout(() => navigate("/"), 4000);
        } else {
          setStatus("error");
          setMessage(res.data.message || "Payment could not be confirmed.");
        }
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e.response?.data?.detail || "Payment verification failed. Contact support if you were debited.");
      });
  }, [reference]);

  return (
    <div style={{ minHeight:"100vh", background:"var(--primary)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:12, padding:"40px 48px", maxWidth:440, width:"100%", textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.2)" }}>

        {status === "loading" && (
          <>
            <Loader size={40} style={{ animation:"spin 0.8s linear infinite", color:"var(--accent)", display:"block", margin:"0 auto 16px" }} />
            <h2 style={{ fontSize:18, fontWeight:"bold", color:"var(--primary)", marginBottom:8 }}>Confirming payment...</h2>
            <p style={{ fontSize:13, color:"#888" }}>Please do not close this page.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
              <CheckCircle size={52} color="#01b88e" strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize:20, fontWeight:"bold", color:"#065f46", marginBottom:8 }}>Payment Successful!</h2>
            <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.65, marginBottom:8 }}>{message}</p>
            <p style={{ fontSize:12, color:"#888", marginBottom:20 }}>Redirecting to the app in 4 seconds...</p>
            <Link to="/" style={{ display:"inline-block", padding:"10px 24px", background:"var(--primary)", color:"#fff", borderRadius:8, fontSize:13, fontWeight:600, textDecoration:"none" }}>
              Start Assessing →
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
              <AlertTriangle size={52} color="#A32D2D" strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize:20, fontWeight:"bold", color:"#791F1F", marginBottom:8 }}>Payment Issue</h2>
            <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.65, marginBottom:20 }}>{message}</p>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              <Link to="/pricing" style={{ padding:"10px 20px", background:"var(--primary)", color:"#fff", borderRadius:8, fontSize:13, fontWeight:600, textDecoration:"none" }}>
                Try Again
              </Link>
              <div style={{ width:"100%", marginTop:8, padding:"20px", borderRadius:10, border:"1px solid #E0E0E0", background:"#FAFAFA" }}>
                <div style={{ fontSize:12, color:"#888", marginBottom:14 }}>Choose how you'd like to reach us</div>
                <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                  <a href="mailto:info@smartrisksheets.com"
                    style={{ flex:1, maxWidth:160, display:"flex", flexDirection:"column", alignItems:"center", gap:8, padding:"16px 12px", border:"1px solid #E0E0E0", borderRadius:10, textDecoration:"none", background:"#fff", transition:"all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="#01b88e"; e.currentTarget.style.background="#f0faf7"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="#E0E0E0"; e.currentTarget.style.background="#fff"; }}>
                    <Mail size={24} color="#1F2854" strokeWidth={1.5} />
                    <div style={{ fontSize:12, fontWeight:"bold", color:"#1F2854" }}>Email us</div>
                    <div style={{ fontSize:11, color:"#888" }}>info@smartrisksheets.com</div>
                  </a>
                  <a href="https://wa.me/2349052288923" target="_blank" rel="noreferrer"
                    style={{ flex:1, maxWidth:160, display:"flex", flexDirection:"column", alignItems:"center", gap:8, padding:"16px 12px", border:"1px solid #E0E0E0", borderRadius:10, textDecoration:"none", background:"#fff", transition:"all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="#25D366"; e.currentTarget.style.background="#f0fdf4"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="#E0E0E0"; e.currentTarget.style.background="#fff"; }}>
                    <MessageCircle size={24} color="#25D366" strokeWidth={1.5} />
                    <div style={{ fontSize:12, fontWeight:"bold", color:"#1F2854" }}>WhatsApp</div>
                    <div style={{ fontSize:11, color:"#888" }}>Eddu SmartRisk</div>
                  </a>
                </div>
                <div style={{ fontSize:11, color:"#aaa", marginTop:12, lineHeight:1.6 }}>
                  WhatsApp for quick help · Email for billing queries
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}