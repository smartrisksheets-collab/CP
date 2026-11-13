// Home after login when a tenant can assess more than commercial paper (D053): pick a service,
// then follow that service's own steps.
import { FileText, Landmark, HandCoins, Activity, ChevronRight, LayoutDashboard } from "lucide-react";
import { SERVICES, SERVICE_ORDER, serviceOf } from "../utils/instruments.js";
import { useIsMobile } from "../hooks/useBreakpoint.js";

const SERVICE_ICONS = { cp: FileText, bond: Landmark, loan: HandCoins, review: Activity };

export function ServiceIcon({ code, size = 20, box = 40 }) {
  const Icon = SERVICE_ICONS[code] || FileText;
  return (
    <span style={{ width:box, height:box, borderRadius:8, background:"#EEF1F7", display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      <Icon size={size} color="#1F2854" strokeWidth={1.75} />
    </span>
  );
}

export function ServiceChip({ code }) {
  if (!code) return null;
  return (
    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:999, background:"#F1F2F5", color:"#5A5A5A", border:"1px solid #E0E0E0", whiteSpace:"nowrap" }}>
      {serviceOf(code).name}
    </span>
  );
}

const btn = { padding:"9px 18px", fontSize:13, borderRadius:6, cursor:"pointer", fontFamily:"Arial,sans-serif", display:"inline-flex", alignItems:"center", gap:6 };

export default function ServiceChooser({ onChoose, draft, onResume, onDiscard, onPastAssessments }) {
  const isMobile = useIsMobile();
  return (
    <div>
      <div style={{ marginBottom:18 }}>
        <h1 style={{ fontSize:20, fontWeight:"bold", color:"var(--primary)", margin:"4px 0 6px" }}>What are you assessing?</h1>
        <div style={{ fontSize:13, color:"#5A5A5A" }}>Choose a service. Each one has its own steps; the statements are read the same way.</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))", gap:14, marginBottom:22 }}>
        {SERVICE_ORDER.map((code) => {
          const s = SERVICES[code];
          return (
            <div key={code} data-service={code}
              style={{ background:"#fff", border:"1px solid #E0E0E0", borderRadius:10, padding:18, display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <ServiceIcon code={code} />
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:"bold", color:"#1F2854" }}>{s.name}</div>
                  <div style={{ fontSize:12, color:"#5A5A5A", lineHeight:1.6, marginTop:3 }}>{s.blurb}</div>
                </div>
              </div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.7 }}>
                <span style={{ fontWeight:"bold", color:"#5A5A5A" }}>{s.steps.length} steps:</span> {s.steps.join(" → ")}
              </div>
              <div style={{ marginTop:"auto" }}>
                <button onClick={() => onChoose(code)} aria-label={`Start ${s.name}`}
                  style={{ ...btn, border:"none", background:"var(--accent)", color:"#fff", fontWeight:600 }}>
                  Start <ChevronRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background:"#fff", border:"1px solid #E0E0E0", borderRadius:10, padding:18 }}>
        <div style={{ fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12 }}>
          Continue where you left off
        </div>
        {draft ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              <span style={{ fontSize:13, fontWeight:"bold", color:"#1F2854" }}>{draft.clientName || "Unnamed client"}</span>
              <ServiceChip code={draft.figures?.instrument || "cp"} />
              <span style={{ fontSize:12, color:"#888" }}>
                Unfinished · started {new Date(draft.createdAt).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" })}
              </span>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => onDiscard(draft)} style={{ ...btn, border:"1px solid #D0D0D0", background:"transparent", color:"#5A5A5A" }}>Discard</button>
              <button onClick={() => onResume(draft)} style={{ ...btn, border:"none", background:"var(--accent)", color:"#fff", fontWeight:600 }}>Resume</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize:13, color:"#888" }}>No unfinished assessment.</div>
        )}
        <button onClick={onPastAssessments}
          style={{ ...btn, marginTop:14, padding:0, border:"none", background:"none", color:"#1F2854", fontSize:12 }}>
          <LayoutDashboard size={13} /> Past assessments
        </button>
      </div>
    </div>
  );
}

export function ServiceBand({ code, index, onChange }) {
  const s = serviceOf(code);
  const i = Math.min(index, s.steps.length - 1);
  return (
    <div data-testid="service-band"
      style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:"10px 14px", marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <ServiceIcon code={code} size={16} box={32} />
        <div>
          <div style={{ fontSize:14, fontWeight:"bold", color:"#1F2854" }}>{s.name}</div>
          <div style={{ fontSize:12, color:"#888" }}>Step {i + 1} of {s.steps.length}: {s.steps[i]}</div>
        </div>
      </div>
      <button onClick={onChange}
        style={{ ...btn, padding:"6px 12px", fontSize:12, border:"1px solid #D0D0D0", background:"transparent", color:"#1F2854" }}>
        Change service
      </button>
    </div>
  );
}
