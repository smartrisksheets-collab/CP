import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { TenantProvider } from "./context/TenantContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TenantProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </TenantProvider>
  </StrictMode>
);