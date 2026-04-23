import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { useTenant } from "./context/TenantContext.jsx";
import { useState } from "react";
import Login from "./pages/Login.jsx";
import AppPage from "./pages/AppPage.jsx";
import Register from "./pages/Register.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import Pricing from "./pages/Pricing.jsx";
import PaymentCallback from "./pages/Paymentcallback.jsx";
import AdminDashboard from "./pages/Admindashboard.jsx";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function FullScreenLoader() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--primary)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 16,
    }}>
      <div style={{
        color: "var(--accent)",
        fontSize: 20, fontWeight: "bold",
        fontFamily: "Arial, sans-serif",
      }}>
        SmartRisk Credit
      </div>
      <div style={{
        width: 32, height: 32,
        border: "3px solid rgba(255,255,255,0.2)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SplashScreen({ onContinue }) {
  const { tenant } = useTenant();
  const [agreed, setAgreed] = useState(false);

  return (
    <div style={{
      position:"fixed", inset:0, background:"#1F2854",
      zIndex:999999, display:"flex", alignItems:"center",
      justifyContent:"center", padding:"40px 24px",
    }}>
      <div style={{ maxWidth:680, width:"100%", textAlign:"center" }}>
        {tenant?.logoUrl && (
          <img src={tenant.logoUrl} alt={tenant.clientName}
               style={{ width:52, height:52, borderRadius:10, objectFit:"contain", display:"block", margin:"0 auto 12px" }} />
        )}
        <div style={{ fontSize:22, fontWeight:"bold", color:"var(--accent)", marginBottom:2 }}>
          SmartRisk Credit
        </div>
        <div style={{ fontSize:12, color:"#7a8db8", marginBottom:36 }}>
          CP &amp; Promissory Note Assessment
        </div>
        <div style={{ fontSize:14, color:"#c8d0e0", lineHeight:1.9, textAlign:"left", marginBottom:32 }}>
          <strong style={{ color:"#fff" }}>Important Notice</strong><br /><br />
          This tool generates quantitative credit risk scores based on financial data you provide.
          All outputs — including scores, ratio analyses, narratives, and reports — are{" "}
          <strong style={{ color:"#fff" }}>for internal reference and decision support only</strong>.<br /><br />
          They do not constitute a credit rating, financial advice, or an investment recommendation,
          and should not be relied upon as the sole basis for any investment, lending, or credit decision.<br /><br />
          SmartRisk Sheets Technologies Limited accepts no liability for any loss or damage arising
          from reliance on any output produced by this tool. Users are responsible for independently
          verifying all extracted figures against source financial statements.
        </div>
        <hr style={{ border:"none", borderTop:"1px solid #2e3f6e", margin:"0 0 24px" }} />
        <label style={{ display:"flex", alignItems:"flex-start", gap:10, fontSize:13, color:"#a0aec0", textAlign:"left", marginBottom:24, cursor:"pointer" }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop:3, flexShrink:0, accentColor:"var(--accent)", width:15, height:15 }}
          />
          I have read and understood this notice and agree to use this tool for internal reference purposes only.
        </label>
        <button
          onClick={onContinue}
          disabled={!agreed}
          style={{
            width:"100%", padding:"11px 0", fontSize:14, fontWeight:"bold",
            background: agreed ? "var(--accent)" : "#2e3f6e",
            color: agreed ? "#fff" : "#4a5a7a",
            border:"none", borderRadius:8,
            cursor: agreed ? "pointer" : "not-allowed",
            transition:"background 0.2s, color 0.2s",
          }}
        >
          Continue to SmartRisk Credit
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [splashDone, setSplashDone] = useState(
    () => !!sessionStorage.getItem("splash_dismissed")
  );

  function dismissSplash() {
    sessionStorage.setItem("splash_dismissed", "1");
    setSplashDone(true);
  }

  if (tenantLoading) return <FullScreenLoader />;

  return (
    <>
      {user && !splashDone && <SplashScreen onContinue={dismissSplash} />}
      <BrowserRouter>
        <Routes>
        <Route path="/login"            element={<Login />} />
        <Route path="/register"         element={<Register />} />
        <Route path="/verify-email"     element={<VerifyEmail />} />
        <Route path="/pricing"          element={<Pricing />} />
        <Route path="/payment/callback" element={<PaymentCallback />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppPage />
            </ProtectedRoute>
          }
        />
      </Routes>
      </BrowserRouter>
    </>
  );
}