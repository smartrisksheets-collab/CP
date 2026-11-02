import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useIsMobile } from "../hooks/useBreakpoint.js";
import { Users, ArrowLeft, Plus, Shield, RefreshCw, Loader, Mail, Ban, RotateCcw, X } from "lucide-react";
import {
  errorMessage, adminGetUsers, adminGetStats, adminAdjustCredits, adminSetRole,
  adminGetAllowlist, adminAddAllowlist, adminRevokeAllowlist,
} from "../api/client.js";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" }) : "—";

const ROLE_PILL = { superadmin: "sr-pill sr-pill-primary", admin: "sr-pill sr-pill-success", user: "sr-pill" };

const css = {
  card : { background:"var(--white)", border:"1px solid var(--border)", borderRadius:8, padding:20, marginBottom:16 },
  th   : { textAlign:"left", fontSize:11, fontWeight:"bold", color:"var(--muted)", padding:"8px 12px", borderBottom:"2px solid var(--border)", textTransform:"uppercase" },
  td   : { padding:"10px 12px", borderBottom:"1px solid var(--chip-bg)", fontSize:13, verticalAlign:"middle" },
  tab  : (active) => ({ padding:"10px 20px", fontSize:13, fontWeight: active ? "bold" : "normal", color: active ? "var(--primary)" : "var(--muted)", background:"transparent", border:"none", borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent", cursor:"pointer", fontFamily:"Arial,sans-serif", display:"inline-flex", alignItems:"center", gap:4 }),
  btn  : (color) => ({ padding:"5px 12px", fontSize:11, fontWeight:600, border:`1px solid ${color}`, color, background:"transparent", borderRadius:5, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4, fontFamily:"Arial,sans-serif" }),
  primaryBtn : (busy) => ({ padding:"9px 18px", fontSize:13, borderRadius:6, cursor: busy ? "not-allowed" : "pointer", border:"1px solid var(--primary)", background:"var(--primary)", color:"var(--white)", fontFamily:"Arial,sans-serif", display:"inline-flex", alignItems:"center", gap:6 }),
  ghostBtn   : { padding:"9px 18px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid var(--input-border)", background:"transparent", color:"var(--primary)", fontFamily:"Arial,sans-serif" },
  overlay    : { position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  errorBox   : { padding:"10px 14px", borderRadius:6, fontSize:13, background:"var(--error-bg)", color:"var(--error)", border:"1px solid var(--error)", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 },
  empty      : { textAlign:"center", padding:32, color:"var(--muted)", fontSize:13 },
};

function Spinner({ size = 13 }) {
  return <Loader size={size} style={{ animation:"spin 0.8s linear infinite" }} />;
}

function ErrorBox({ message, onRetry }) {
  return (
    <div style={css.errorBox}>
      <span>{message}</span>
      {onRetry && <button style={css.btn("var(--error)")} onClick={onRetry}><RotateCcw size={11} /> Retry</button>}
    </div>
  );
}

function ConfirmModal({ confirm, busy, error, onCancel, onConfirm, isMobile }) {
  return (
    <div style={css.overlay}>
      <div style={{ background:"var(--white)", borderRadius:10, padding: isMobile ? "20px 16px" : "28px 32px", maxWidth:420, width:"100%", boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
        <h3 style={{ fontSize:15, fontWeight:"bold", color:"var(--primary)", marginBottom:8 }}>{confirm.title}</h3>
        <div style={{ fontSize:13, color:"var(--text-secondary)", lineHeight:1.6, marginBottom:20 }}>{confirm.body}</div>
        {error && <div style={{ fontSize:12, color:"var(--error)", marginBottom:12 }}>{error}</div>}
        <div style={{ display:"flex", flexDirection: isMobile ? "column-reverse" : "row", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onCancel} disabled={busy} style={css.ghostBtn}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={css.primaryBtn(busy)}>
            {busy && <Spinner />} {confirm.action}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersTable({ users, currentEmail, onOpen, onCredits, onRole }) {
  return (
    <div style={css.card}>
      <div className="sr-table-scroll">
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr>
              {["Email","Name","Company","Plan","Credits","Role","Verified","Joined","Actions"].map((h) => (
                <th key={h} style={h === "Credits" ? { ...css.th, textAlign:"right" } : css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td style={css.td}>
                  <strong onClick={() => onOpen(u)}
                    style={{ color:"var(--primary)", cursor:"pointer", textDecoration:"underline", textDecorationStyle:"dotted" }}>
                    {u.email}
                  </strong>
                </td>
                <td style={css.td}>{u.name || "—"}</td>
                <td style={css.td}>{u.company || "—"}</td>
                <td style={css.td}><span className="sr-pill sr-pill-info">{u.plan}</span></td>
                <td style={{ ...css.td, textAlign:"right", fontWeight:"bold", color: u.credits > 0 ? "var(--score-full)" : "var(--error)" }}>
                  {u.credits}
                </td>
                <td style={css.td}>
                  <span className={ROLE_PILL[u.role] || "sr-pill"}>{u.role}</span>
                  {u.accessRevoked && <span className="sr-pill sr-pill-error" style={{ marginLeft:6 }}>revoked</span>}
                </td>
                <td style={css.td}>
                  <span style={{ color: u.verified ? "var(--score-full)" : "var(--error)", fontSize:12 }}>{u.verified ? "✓" : "✗"}</span>
                </td>
                <td style={{ ...css.td, fontSize:11, color:"var(--muted)" }}>{fmtDate(u.createdAt)}</td>
                <td style={css.td}>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <button style={css.btn("var(--score-full)")} onClick={() => onCredits(u)}>
                      <Plus size={11} /> Credits
                    </button>
                    {u.role === "user" && u.email !== currentEmail && !u.accessRevoked && (
                      <button style={css.btn("var(--primary)")} onClick={() => onRole(u, "admin")}>
                        <Shield size={11} /> Make Admin
                      </button>
                    )}
                    {u.role === "admin" && u.email !== currentEmail && (
                      <button style={css.btn("var(--error)")} onClick={() => onRole(u, "user")}>
                        Revoke Admin
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <div style={css.empty}>No users yet.</div>}
      </div>
    </div>
  );
}

function AllowlistPanel({ entries, error, onRetry, currentEmail, onAdd, onRevoke }) {
  const [email, setEmail]   = useState("");
  const [note, setNote]     = useState("");
  const [adding, setAdding] = useState(false);
  const [formErr, setFormErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) { setFormErr("Enter an email address."); return; }
    setAdding(true);
    setFormErr("");
    try {
      await onAdd(email.trim(), note.trim());
      setEmail("");
      setNote("");
    } catch (err) {
      setFormErr(errorMessage(err, "Failed to add email."));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={css.card}>
      <div style={{ fontSize:13, color:"var(--text-secondary)", lineHeight:1.6, marginBottom:14 }}>
        Personal emails (Gmail, Yahoo, Outlook and similar) cannot register unless they are added here.
        Revoking an email signs that user out and blocks their access until it is added again. Their data is kept.
      </div>

      <form className="sr-admin-form" onSubmit={submit}>
        <input className="sr-admin-input" type="email" placeholder="tester@gmail.com"
          value={email} onChange={(e) => { setEmail(e.target.value); setFormErr(""); }} />
        <input className="sr-admin-input" type="text" placeholder="Note (optional), e.g. Pilot tester"
          value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="submit" disabled={adding} style={css.primaryBtn(adding)}>
          {adding ? <Spinner /> : <Plus size={13} />} Add email
        </button>
      </form>
      {formErr && <div style={{ fontSize:12, color:"var(--error)", marginBottom:12 }}>{formErr}</div>}

      {error ? <ErrorBox message={error} onRetry={onRetry} /> : (
        <div className="sr-table-scroll">
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr>
                {["Email","Note","Status","Account","Added","Actions"].map((h) => <th key={h} style={css.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.email}>
                  <td style={css.td}><strong style={{ color:"var(--primary)" }}>{e.email}</strong></td>
                  <td style={css.td}>{e.note || "—"}</td>
                  <td style={css.td}>
                    {e.active
                      ? <span className="sr-pill sr-pill-success">Active</span>
                      : <span className="sr-pill sr-pill-error" title={`Revoked by ${e.revokedBy || "—"}`}>Revoked {fmtDate(e.revokedAt)}</span>}
                  </td>
                  <td style={css.td}>{e.hasAccount ? "Registered" : "Not yet"}</td>
                  <td style={{ ...css.td, fontSize:11, color:"var(--muted)" }}>{fmtDate(e.createdAt)} · {e.addedBy}</td>
                  <td style={css.td}>
                    {e.active ? (
                      e.email !== currentEmail && (
                        <button style={css.btn("var(--error)")} onClick={() => onRevoke(e)}>
                          <Ban size={11} /> Revoke
                        </button>
                      )
                    ) : (
                      <button style={css.btn("var(--score-full)")} onClick={() => onAdd(e.email, "").catch((err) => setFormErr(errorMessage(err, "Failed to restore email.")))}>
                        <RotateCcw size={11} /> Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <div style={css.empty}>No personal emails added yet.</div>}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();
  const isAdmin   = ["admin","superadmin"].includes(user?.role);

  const [tab, setTab]         = useState("users");
  const [users, setUsers]     = useState([]);
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const [allowlist, setAllowlist]       = useState([]);
  const [allowlistErr, setAllowlistErr] = useState("");

  const [userModal, setUserModal]       = useState(null); // onboarding details
  const [adjustModal, setAdjustModal]   = useState(null); // { email, credits }
  const [adjustAmt, setAdjustAmt]       = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting]       = useState(false);
  const [adjustErr, setAdjustErr]       = useState("");

  const [confirm, setConfirm]       = useState(null); // { title, body, action, run }
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");

  // State is only set in promise callbacks, so this is safe to start from an effect
  function fetchData() {
    return Promise.all([adminGetUsers(), adminGetStats()])
      .then(([usersRes, statsRes]) => {
        setUsers(usersRes.data);
        setStats(statsRes.data);
        setError("");
      })
      .catch((e) => setError(errorMessage(e, "Failed to load admin data.")))
      .finally(() => setLoading(false))
      .then(loadAllowlist);
  }

  function loadData() {
    setLoading(true);
    return fetchData();
  }

  // Loaded on its own so the users view still works if this request fails
  function loadAllowlist() {
    return adminGetAllowlist()
      .then((res) => {
        setAllowlist(res.data);
        setAllowlistErr("");
      })
      .catch((e) => setAllowlistErr(errorMessage(e, "Failed to load test emails.")));
  }

  useEffect(() => {
    if (!isAdmin) {
      navigate("/", { replace: true });
      return;
    }
    fetchData();
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdjust() {
    const amt = Number(adjustAmt);
    if (!adjustAmt.trim() || !Number.isInteger(amt) || amt === 0) { setAdjustErr("Enter a whole number other than 0."); return; }
    if (!adjustReason.trim()) { setAdjustErr("Reason is required."); return; }
    setAdjusting(true);
    setAdjustErr("");
    try {
      await adminAdjustCredits(adjustModal.email, amt, adjustReason.trim());
      setAdjustModal(null);
      await loadData();
    } catch (e) {
      setAdjustErr(errorMessage(e, "Failed to adjust credits."));
    } finally {
      setAdjusting(false);
    }
  }

  function askRole(u, role) {
    setConfirmErr("");
    setConfirm(role === "admin"
      ? { title:"Make admin?", body:`${u.email} will be able to manage users, credits and test emails.`, action:"Make Admin",
          run: () => adminSetRole(u.email, "admin").then(loadData) }
      : { title:"Revoke admin?", body:`${u.email} will lose access to the admin dashboard.`, action:"Revoke Admin",
          run: () => adminSetRole(u.email, "user").then(loadData) });
  }

  function askRevoke(entry) {
    setConfirmErr("");
    setConfirm({
      title : "Revoke test email?",
      body  : entry.hasAccount
        ? `${entry.email} will be signed out and blocked from logging in. Their assessments are kept. You can restore access later.`
        : `${entry.email} will no longer be able to register.`,
      action: "Revoke",
      run   : () => adminRevokeAllowlist(entry.email).then(loadData),
    });
  }

  async function runConfirm() {
    setConfirmBusy(true);
    setConfirmErr("");
    try {
      await confirm.run();
      setConfirm(null);
    } catch (e) {
      setConfirmErr(errorMessage(e, "Action failed."));
    } finally {
      setConfirmBusy(false);
    }
  }

  // Reload users too, so their "revoked" badge stays in step with the list
  const addAllowlist = (email, note) => adminAddAllowlist(email, note).then(loadData);

  if (!isAdmin) return null;

  if (loading && !stats) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)", color:"var(--accent)" }}>
      <Spinner size={28} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const loadFailed = !!error && !stats;

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", paddingBottom:60 }}>
      {/* Header */}
      <div style={{ background:"var(--primary)", padding: isMobile ? "10px 12px" : "12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <button onClick={() => navigate("/")} style={{ background:"none", border:"none", color:"var(--header-text)", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontFamily:"Arial,sans-serif" }}>
          <ArrowLeft size={14} /> {isMobile ? "Back" : "Back to App"}
        </button>
        <div style={{ color:"var(--accent)", fontSize:15, fontWeight:"bold" }}>Admin Dashboard</div>
        <button onClick={loadData} disabled={loading} style={{ background:"none", border:"1px solid var(--header-border)", color:"var(--header-text)", padding:"5px 10px", borderRadius:5, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", gap:5, fontFamily:"Arial,sans-serif" }}>
          {loading ? <Spinner size={12} /> : <RefreshCw size={12} />} Refresh
        </button>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding: isMobile ? "16px 12px 0" : "24px 24px 0" }}>

        {error && <ErrorBox message={error} onRetry={loadData} />}

        {/* Stats */}
        {stats && (
          <div style={{ display:"flex", gap:16, marginBottom:24, flexWrap:"wrap" }}>
            {[
              { label:"Total Users",       value: stats.totalUsers },
              { label:"Verified Users",    value: stats.verifiedUsers },
              { label:"Total Assessments", value: stats.totalAssessments },
              { label:"Total Revenue",     value: `₦${(stats.totalRevenueNaira||0).toLocaleString()}` },
            ].map((s) => (
              <div key={s.label} style={{ background:"var(--white)", border:"1px solid var(--border)", borderRadius:8, padding:20, flex:1, minWidth: isMobile ? 120 : 160 }}>
                <div style={{ fontSize:11, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>{s.label}</div>
                <div style={{ fontSize:26, fontWeight:"bold", color:"var(--primary)" }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ background:"var(--white)", borderBottom:"1px solid var(--border)", marginBottom:16, borderRadius:"8px 8px 0 0", display:"flex", flexWrap:"wrap" }}>
          <button style={css.tab(tab==="users")} onClick={() => setTab("users")}>
            <Users size={13} /> Users{loadFailed ? "" : ` (${users.length})`}
          </button>
          <button style={css.tab(tab==="allowlist")} onClick={() => setTab("allowlist")}>
            <Mail size={13} /> Test emails ({allowlist.length})
          </button>
        </div>

        {tab === "users" && !loadFailed && (
          <UsersTable
            users={users}
            currentEmail={user?.email}
            onOpen={setUserModal}
            onCredits={(u) => { setAdjustModal(u); setAdjustAmt(""); setAdjustReason(""); setAdjustErr(""); }}
            onRole={askRole}
          />
        )}

        {tab === "allowlist" && (
          <AllowlistPanel
            entries={allowlist}
            error={allowlistErr}
            onRetry={loadAllowlist}
            currentEmail={user?.email}
            onAdd={addAllowlist}
            onRevoke={askRevoke}
          />
        )}
      </div>

      {/* Onboarding details modal */}
      {userModal && (
        <div style={css.overlay}>
          <div style={{ background:"var(--white)", borderRadius:12, width:"100%", maxWidth:440, padding: isMobile ? "20px 16px" : "28px 32px", position:"relative", boxShadow:"0 16px 60px rgba(0,0,0,0.2)" }}>
            <button onClick={() => setUserModal(null)} aria-label="Close" style={{ position:"absolute", top:14, right:16, background:"none", border:"none", cursor:"pointer", color:"var(--muted)" }}>
              <X size={16} />
            </button>
            <div style={{ fontSize:16, fontWeight:"bold", color:"var(--primary)", marginBottom:4 }}>{userModal.name || "—"}</div>
            <div style={{ fontSize:12, color:"var(--muted)", marginBottom:20 }}>{userModal.email}</div>

            <div style={{ fontSize:11, fontWeight:"bold", color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Onboarding Responses</div>

            {userModal.onboardingRole || userModal.onboardingProcess || userModal.onboardingVolume ? (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {[
                  ["Role",            userModal.onboardingRole],
                  ["Current process", userModal.onboardingProcess],
                  ["Monthly volume",  userModal.onboardingVolume],
                ].map(([label, val]) => (
                  <div key={label} style={{ background:"var(--bg)", borderRadius:6, padding:"10px 14px" }}>
                    <div style={{ fontSize:11, color:"var(--muted)", marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:13, color:"var(--primary)", fontWeight:500 }}>{val || "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize:13, color:"var(--muted)", fontStyle:"italic" }}>No onboarding responses recorded.</div>
            )}
          </div>
        </div>
      )}

      {/* Credit adjustment modal */}
      {adjustModal && (
        <div style={css.overlay}>
          <div style={{ background:"var(--white)", borderRadius:10, padding: isMobile ? "20px 16px" : "28px 32px", maxWidth:400, width:"100%", boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontSize:15, fontWeight:"bold", color:"var(--primary)", marginBottom:4 }}>Adjust Credits</h3>
            <div style={{ fontSize:12, color:"var(--muted)", marginBottom:20 }}>{adjustModal.email} · Current balance: {adjustModal.credits}</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:500, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>
                Amount (positive = add, negative = remove)
              </label>
              <input className="sr-admin-input" type="number" step="1" placeholder="e.g. 5 or -2"
                value={adjustAmt} onChange={e => { setAdjustAmt(e.target.value); setAdjustErr(""); }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:500, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>Reason *</label>
              <input className="sr-admin-input" type="text" placeholder="e.g. Complimentary credits for onboarding"
                value={adjustReason} onChange={e => { setAdjustReason(e.target.value); setAdjustErr(""); }} />
            </div>

            {adjustErr && <div style={{ fontSize:12, color:"var(--error)", marginBottom:12 }}>{adjustErr}</div>}

            <div style={{ display:"flex", flexDirection: isMobile ? "column-reverse" : "row", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setAdjustModal(null)} disabled={adjusting} style={css.ghostBtn}>Cancel</button>
              <button onClick={handleAdjust} disabled={adjusting} style={css.primaryBtn(adjusting)}>
                {adjusting && <Spinner />}
                {adjusting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          confirm={confirm}
          busy={confirmBusy}
          error={confirmErr}
          isMobile={isMobile}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
