import { createContext, useContext, useEffect, useState } from "react";
import { getTenant } from "../api/client";

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [tenant, setTenant]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const hostname = window.location.hostname;

    getTenant(hostname)
      .then((res) => {
        setTenant(res.data);
        applyTheme(res.data);
      })
      .catch(() => {
        // Fallback to SmartRisk defaults if tenant fetch fails
        const defaults = {
          clientName  : "SmartRisk Credit",
          primaryColor: "#1F2854",
          primaryHover: "#2A3870",
          accentColor : "#01b88e",
          accentHover : "#019B78",
          accentRgb   : "1,184,142",
          requiresCode: false,
        };
        setTenant(defaults);
        applyTheme(defaults);
        setError("Tenant config unavailable — using defaults.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

function applyTheme(tenant) {
  const root = document.documentElement;
  root.style.setProperty("--primary",      tenant.primaryColor || "#1F2854");
  root.style.setProperty("--primary-hover",tenant.primaryHover || "#2A3870");
  root.style.setProperty("--accent",       tenant.accentColor  || "#01b88e");
  root.style.setProperty("--accent-hover", tenant.accentHover  || "#019B78");
  root.style.setProperty("--accent-rgb",   tenant.accentRgb    || "1,184,142");
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}