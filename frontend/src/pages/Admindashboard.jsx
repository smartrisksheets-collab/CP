import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Users, BarChart2, ArrowLeft, Plus, Minus, Shield, RefreshCw, Loader } from "lucide-react";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem("sr_token")}` };
}

export default function AdminDashboard() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [tab, setTab]         = useState("users");
  const [users, setUsers]     = useState([]);
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Credit adjustment modal
  const [adjustModal, setAdjustModal] = useState(null); // { email, credits }
  const [adjustAmt, setAdjustAmt]     = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting]     = useState(false);
  const [adjustErr, setAdjustErr]     = useState("");

  useEffect(() => {
    if (!user || !["admin","superadmin"].includes(user.role)) {
      navigate("/");
      return;
    }
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        axios.get(`${BASE_URL}/admin/users`, { headers: authHeader() }),
        axios.get(`${BASE_URL}/admin/stats`, { headers: authHeader() }),
      ]);
      setUsers(usersRes.data);
      setStats(statsRes.data);
    } catch (e) {
      setError("Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdjust() {
    const amt = parseInt(adjustAmt);
    if (!amt || isNaN(amt)) { setAdjustErr("Enter a valid number."); return; }
    if (!adjustReason.trim()) { setAdjustErr("Reason is required."); return; }
    setAdjusting(true);
    setAdjustErr("");
    try {
      await axios.post(`${BASE_URL}/admin/users/credits`,
        { email: adjustModal.email, amount: amt, reason: adjustReason },
        { headers: authHeader() }
      );
      await loadData();
      setAdjustModal(null);
      setAdjustAmt("");
      setAdjustReason("");
    } catch (e) {
      setAdjustErr(e.response?.data?.detail || "Failed to adjust credits.");
    } finally {
      setAdjusting(false);
    }
  }

  async function handleSetRole(email, role) {
    try {
      await axios.post(`${BASE_URL}/admin/users/role`,
        { email, role },
        { headers: authHeader() }
      );
      await loadData();
    } catch (e) {
      alert(e.response?.data?.detail || "Failed to update role.");
    }
  }

  const css = {
    page   : { minHeight:"100vh", background:"#F5F5F2", paddingBottom:60 },
    header : { background:"var(--primary)", padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" },
    card   : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
    th     : { textAlign:"left", fontSize:11, fontWeight:"bold", color:"#888", padding:"8px 12px", borderBottom:"2px solid #E8E8E8", textTransform:"uppercase" },
    td     : { padding:"10px 12px", borderBottom:"1px solid #F0F0F0", fontSize:13, verticalAlign:"middle" },
    tab    : (active) => ({ padding:"10px 20px", fontSize:13, fontWeight: active ? "bold" : "normal", color: active ? "var(--primary)" : "#888", background:"transparent", border:"none", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent", cursor:"pointer", fontFamily:"Arial,sans-serif" }),
    stat   : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, flex:1, minWidth:160 },
    btn    : (color) => ({ padding:"5px 12px", fontSize:11, fontWeight:600, border:`1px solid ${color}`, color:color, background:"transparent", borderRadius:5, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4, fontFamily:"Arial,sans-serif" }),
  };

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F5F5F2" }}>
      <Loader size={28} style={{ animation:"spin 0.8s linear infinite", color:"var(--accent)" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={css.page}>
      {/* Header */}
      <div style={css.header}>
        <button onClick={() => navigate("/")} style={{ background:"none", border:"none", color:"#ccc", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontFamily:"Arial,sans-serif" }}>
          <ArrowLeft size={14} /> Back to App
        </button>
        <div style={{ color:"var(--accent)", fontSize:15, fontWeight:"bold" }}>Admin Dashboard</div>
        <button onClick={loadData} style={{ background:"none", border:"1px solid #3a4a7a", color:"#ccc", padding:"5px 10px", borderRadius:5, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", gap:5, fontFamily:"Arial,sans-serif" }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"24px 24px 0" }}>

        {error && (
          <div style={{ padding:"10px 14px", borderRadius:6, fontSize:13, background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", marginBottom:16 }}>
            {error}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div style={{ display:"flex", gap:16, marginBottom:24, flexWrap:"wrap" }}>
            {[
              { label:"Total Users",       value: stats.totalUsers },
              { label:"Verified Users",    value: stats.verifiedUsers },
              { label:"Total Assessments", value: stats.totalAssessments },
              { label:"Total Revenue",     value: `₦${(stats.totalRevenueNaira||0).toLocaleString()}` },
            ].map((s) => (
              <div key={s.label} style={css.stat}>
                <div style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>{s.label}</div>
                <div style={{ fontSize:26, fontWeight:"bold", color:"var(--primary)" }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ background:"#fff", borderBottom:"1px solid #E0E0E0", marginBottom:16, borderRadius:"8px 8px 0 0" }}>
          <button style={css.tab(tab==="users")}       onClick={() => setTab("users")}>
            <Users size={13} style={{ marginRight:4, verticalAlign:"middle" }} /> Users ({users.length})
          </button>
        </div>

        {/* Users table */}
        <div style={css.card}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr>
                  <th style={css.th}>Email</th>
                  <th style={css.th}>Name</th>
                  <th style={css.th}>Company</th>
                  <th style={css.th}>Plan</th>
                  <th style={{ ...css.th, textAlign:"right" }}>Credits</th>
                  <th style={css.th}>Role</th>
                  <th style={css.th}>Verified</th>
                  <th style={css.th}>Joined</th>
                  <th style={css.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.email}>
                    <td style={css.td}><strong style={{ color:"var(--primary)" }}>{u.email}</strong></td>
                    <td style={css.td}>{u.name || "—"}</td>
                    <td style={css.td}>{u.company || "—"}</td>
                    <td style={css.td}>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:999, background:"#EEF4FF", color:"#1A5276", border:"1px solid #9DBFEA" }}>
                        {u.plan}
                      </span>
                    </td>
                    <td style={{ ...css.td, textAlign:"right", fontWeight:"bold", color: u.credits > 0 ? "#1E7E34" : "#A32D2D" }}>
                      {u.credits}
                    </td>
                    <td style={css.td}>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:999, background: u.role === "admin" ? "#EAF3DE" : "#F5F5F2", color: u.role === "admin" ? "#27500A" : "#888" }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={css.td}>
                      <span style={{ color: u.verified ? "#1E7E34" : "#A32D2D", fontSize:12 }}>
                        {u.verified ? "✓" : "✗"}
                      </span>
                    </td>
                    <td style={{ ...css.td, fontSize:11, color:"#888" }}>
                      {new Date(u.createdAt).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" })}
                    </td>
                    <td style={css.td}>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        <button style={css.btn("#1E7E34")} onClick={() => { setAdjustModal(u); setAdjustAmt(""); setAdjustReason(""); setAdjustErr(""); }}>
                          <Plus size={11} /> Credits
                        </button>
                        {u.role === "user" && u.email !== user?.email && (
                          <button style={css.btn("#1F2854")} onClick={() => handleSetRole(u.email, "admin")}>
                            <Shield size={11} /> Make Admin
                          </button>
                        )}
                        {u.role === "admin" && u.email !== user?.email && (
                          <button style={css.btn("#A32D2D")} onClick={() => handleSetRole(u.email, "user")}>
                            Revoke Admin
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div style={{ textAlign:"center", padding:32, color:"#888", fontSize:13 }}>No users yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Credit Adjustment Modal */}
      {adjustModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ background:"#fff", borderRadius:10, padding:"28px 32px", maxWidth:400, width:"100%", boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontSize:15, fontWeight:"bold", color:"var(--primary)", marginBottom:4 }}>Adjust Credits</h3>
            <div style={{ fontSize:12, color:"#888", marginBottom:20 }}>{adjustModal.email} · Current balance: {adjustModal.credits}</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:500, color:"#5A5A5A", display:"block", marginBottom:6 }}>
                Amount (positive = add, negative = remove)
              </label>
              <input type="number" placeholder="e.g. 5 or -2"
                value={adjustAmt} onChange={e => { setAdjustAmt(e.target.value); setAdjustErr(""); }}
                style={{ width:"100%", padding:"9px 12px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, boxSizing:"border-box" }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:500, color:"#5A5A5A", display:"block", marginBottom:6 }}>Reason *</label>
              <input type="text" placeholder="e.g. Complimentary credits for onboarding"
                value={adjustReason} onChange={e => { setAdjustReason(e.target.value); setAdjustErr(""); }}
                style={{ width:"100%", padding:"9px 12px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, boxSizing:"border-box" }} />
            </div>

            {adjustErr && <div style={{ fontSize:12, color:"#791F1F", marginBottom:12 }}>{adjustErr}</div>}

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setAdjustModal(null)} style={{ padding:"9px 18px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif" }}>
                Cancel
              </button>
              <button onClick={handleAdjust} disabled={adjusting} style={{ padding:"9px 18px", fontSize:13, borderRadius:6, cursor: adjusting ? "not-allowed" : "pointer", border:"1px solid var(--primary)", background:"var(--primary)", color:"#fff", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 }}>
                {adjusting ? <Loader size={13} style={{ animation:"spin 0.8s linear infinite" }} /> : null}
                {adjusting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}