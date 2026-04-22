import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { useTenant } from "./context/TenantContext.jsx";
import Login from "./pages/Login.jsx";
import AppPage from "./pages/AppPage.jsx";
import Register from "./pages/Register.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import Pricing from "./pages/Pricing.jsx";
import PaymentCallback from "./pages/PaymentCallback.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

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

export default function App() {
  const { loading: tenantLoading } = useTenant();

  if (tenantLoading) return <FullScreenLoader />;

  return (
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
  );
}