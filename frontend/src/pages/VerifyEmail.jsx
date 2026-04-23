import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const { tenant }     = useTenant();
  const token          = searchParams.get("token");

  const [status, setStatus]   = useState("pending");
  const [message, setMessage] = useState("");

  async function handleActivate() {
    if (!token) { setStatus("error"); setMessage("Invalid verification link."); return; }
    setStatus("loading");
    axios.post(`${BASE_URL}/auth/verify-email`, { token })
      .then((res) => {
        setStatus("success");
        setMessage(res.data.message || "Email verified successfully.");
        setTimeout(() => navigate("/login"), 3000);
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e.response?.data?.detail || "Verification failed. The link may have expired.");
      });
  }

  return (
    <div style={{ minHeight:"100vh", background:"var(--primary)", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:12, padding:"40px 48px", maxWidth:440, width:"100%", textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.2)" }}>
        {tenant?.logoUrl && (
          <img src={tenant.logoUrl} alt={tenant.clientName}
               style={{ height:36, objectFit:"contain", display:"block", margin:"0 auto 24px" }} />
        )}

        {status === "pending" && (
          <>
            <div style={{ fontSize:48, marginBottom:16 }}>📬</div>
            <h2 style={{ fontSize:20, fontWeight:"bold", color:"var(--primary)", marginBottom:8 }}>Activate Your Account</h2>
            <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.65, marginBottom:24 }}>
              Click below to verify your email and activate your account.
            </p>
            <button onClick={handleActivate}
              style={{ padding:"12px 28px", background:"var(--primary)", color:"#fff", borderRadius:8, fontSize:14, fontWeight:600, border:"none", cursor:"pointer" }}>
              Activate Account →
            </button>
          </>
        )}
          {status === "loading" && (
          <>
            <Loader size={40} style={{ animation:"spin 0.8s linear infinite", color:"var(--accent)", display:"block", margin:"0 auto 16px" }} />
            <h2 style={{ fontSize:18, fontWeight:"bold", color:"var(--primary)", marginBottom:8 }}>Verifying your email...</h2>
            <p style={{ fontSize:13, color:"#888" }}>Please wait a moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
            <h2 style={{ fontSize:20, fontWeight:"bold", color:"#065f46", marginBottom:8 }}>Email Verified!</h2>
            <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.65, marginBottom:16 }}>{message}</p>
            <p style={{ fontSize:12, color:"#888", marginBottom:16 }}>Redirecting to login in 3 seconds...</p>
            <Link to="/login" style={{ display:"inline-block", padding:"10px 24px", background:"var(--primary)", color:"#fff", borderRadius:8, fontSize:13, fontWeight:600, textDecoration:"none" }}>
              Sign In Now →
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize:48, marginBottom:16 }}>❌</div>
            <h2 style={{ fontSize:20, fontWeight:"bold", color:"#791F1F", marginBottom:8 }}>Verification Failed</h2>
            <p style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.65, marginBottom:20 }}>{message}</p>
            <Link to="/register" style={{ display:"inline-block", padding:"10px 24px", background:"var(--primary)", color:"#fff", borderRadius:8, fontSize:13, fontWeight:600, textDecoration:"none" }}>
              Register Again
            </Link>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}