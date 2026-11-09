import { createContext, useContext, useEffect, useState } from "react";
import {
  getMe, logout as apiLogout, endSession, isIdleExpired, isTokenExpired, lastActive, markActive,
} from "../api/client";
import useIdleLogout from "../hooks/useIdleLogout.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("sr_token");
    if (!token) {
      setLoading(false);
      return;
    }
    // Stale session from an earlier visit: clear it here; ProtectedRoute
    // then sends the user to /login, which shows the reason
    const staleReason = isTokenExpired(token) ? "expired" : isIdleExpired() ? "idle" : null;
    if (staleReason) {
      endSession(staleReason, { redirect: false });
      setLoading(false);
      return;
    }
    if (lastActive() === null) markActive(); // session from before this feature

    getMe()
      .then((res) => {
        localStorage.setItem("sr_user", JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem("sr_token");
          localStorage.removeItem("sr_user");
          return;
        }
        // Network, 500 or timeout: keep the session and use the last known
        // user so a blip does not send a signed-in user to /login
        try {
          const cached = JSON.parse(localStorage.getItem("sr_user") || "null");
          if (cached?.email) setUser(cached);
        } catch { /* corrupt cache, stay signed out */ }
      })
      .finally(() => setLoading(false));
  }, []);

  useIdleLogout(Boolean(user));

  const login = (token, userData) => {
    localStorage.removeItem("sr_logout_reason");
    markActive();
    localStorage.setItem("sr_token", token);
    localStorage.setItem("sr_user", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    apiLogout();
    setUser(null);
  };

  const refreshUser = () =>
    getMe().then((res) => {
      localStorage.setItem("sr_user", JSON.stringify(res.data));
      setUser(res.data);
    });

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}