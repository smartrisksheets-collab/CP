import { createContext, useContext, useEffect, useState } from "react";
import { getMe, logout as apiLogout } from "../api/client";

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

    getMe()
      .then((res) => setUser(res.data))
      .catch((err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem("sr_token");
          localStorage.removeItem("sr_user");
        }
        // any other error (network, 500, timeout) — leave token intact
      })
      .finally(() => setLoading(false));
  }, []);

  const login = (token, userData) => {
    localStorage.setItem("sr_token", token);
    localStorage.setItem("sr_user", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    apiLogout();
    setUser(null);
  };

  const refreshUser = () =>
    getMe().then((res) => setUser(res.data));

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