import { useEffect, useState } from "react";

const MESSAGES = [
  "Sending document to AI...",
  "Reading financial statements...",
  "Extracting income statement figures...",
  "Extracting balance sheet figures...",
  "Checking for standalone vs group figures...",
  "Computing EBITDA...",
  "Almost done...",
];

export default function Extraction({ onDone }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setMsgIdx((i) => Math.min(i + 1, MESSAGES.length - 1));
    }, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20 }}>
      <div style={{ textAlign:"center", padding:"60px 40px" }}>
        <div style={{
          width:40, height:40, border:"3px solid #E8E8E8",
          borderTopColor:"var(--accent)", borderRadius:"50%",
          animation:"spin 0.7s linear infinite", margin:"0 auto 20px",
        }} />
        <div style={{ fontSize:15, color:"#1F2854", marginBottom:8 }}>{MESSAGES[msgIdx]}</div>
        <div style={{ fontSize:12, color:"#aaa" }}>This usually takes 20–60 seconds. Do not close this tab.</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}