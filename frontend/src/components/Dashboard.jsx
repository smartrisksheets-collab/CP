import { useEffect, useState } from "react";
import { getHistory } from "../api/client.js";
import { Loader } from "lucide-react";

export default function Dashboard() {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    getHistory()
      .then((res) => setRows(res.data))
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ textAlign:"center", padding:40 }}>
      <Loader size={24} style={{ animation:"spin 0.8s linear infinite", color:"var(--accent)" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return <div style={{ color:"#791F1F", fontSize:13 }}>{error}</div>;

  if (!rows.length) return (
    <div style={{ fontSize:13, color:"#888", textAlign:"center", padding:24 }}>
      No past assessments yet. Complete your first assessment to see it here.
    </div>
  );

  const th = { textAlign:"left", fontSize:11, fontWeight:"bold", color:"#888", padding:"8px 10px", borderBottom:"2px solid #E8E8E8", textTransform:"uppercase" };
  const td = { padding:"10px", borderBottom:"1px solid #F0F0F0", fontSize:13 };

  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr>
            <th style={th}>Date</th>
            <th style={th}>Client</th>
            <th style={th}>Rating</th>
            <th style={{ ...th, textAlign:"right" }}>Score</th>
            <th style={th}>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const eligible = r.eligible;
            return (
              <tr key={r.id}>
                <td style={td}>{new Date(r.createdAt).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" })}</td>
                <td style={{ ...td, fontWeight:"bold", color:"var(--primary)" }}>{r.clientName || "—"}</td>
                <td style={td}>{r.creditRating || "—"}</td>
                <td style={{ ...td, textAlign:"right", fontWeight:"bold" }}>{r.totalScore} / 56</td>
                <td style={td}>
                  <span style={{
                    fontSize:11, padding:"2px 10px", borderRadius:999, fontWeight:"bold",
                    background: eligible ? "#EAF3DE" : "#FCEBEB",
                    color:      eligible ? "#27500A" : "#791F1F",
                    border:     `1px solid ${eligible ? "#97C459" : "#F09595"}`,
                  }}>
                    {eligible ? "Eligible" : "Not Eligible"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}