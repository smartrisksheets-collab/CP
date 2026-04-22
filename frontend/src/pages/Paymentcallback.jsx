import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader } from "lucide-react";
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
            <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
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
            <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
            <h2 style={{ fontSize:20, fontWeight:"bold", color:"#791F1F", marginBottom:8 }}>Payment Issue</h2>
            <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.65, marginBottom:20 }}>{message}</p>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              <Link to="/pricing" style={{ padding:"10px 20px", background:"var(--primary)", color:"#fff", borderRadius:8, fontSize:13, fontWeight:600, textDecoration:"none" }}>
                Try Again
              </Link>
              <a href="mailto:support@smartrisksheets.com" style={{ padding:"10px 20px", background:"transparent", color:"var(--primary)", border:"1px solid var(--primary)", borderRadius:8, fontSize:13, fontWeight:600, textDecoration:"none" }}>
                Contact Support
              </a>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}