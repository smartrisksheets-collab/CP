import { useState } from "react";
import { saveOnboarding } from "../api/client.js";

const QUESTIONS = [
  {
    key: "role",
    q: "What best describes your role?",
    sub: "This helps us improve SmartRisk Credit for your team.",
    options: [
      "Credit / Fixed Income Analyst",
      "Portfolio Manager / Fund Manager",
      "Risk or Compliance Officer",
      "CIO / Head of Investment",
      "Other",
    ],
  },
  {
    key: "process",
    q: "How does your team currently assess CP issuers?",
    sub: "We want to understand what SmartRisk Credit is replacing for you.",
    options: [
      "Excel model built in-house",
      "We rely on the external credit rating only",
      "Manual ratio calculation from the financial statements",
      "We have no standardised process",
      "We use a third-party tool",
    ],
  },
  {
    key: "volume",
    q: "How many CP assessments does your team run per month?",
    sub: "This helps us suggest the right plan for you.",
    options: [
      "1 to 5 assessments",
      "6 to 15 assessments",
      "16 to 30 assessments",
      "More than 30 assessments",
    ],
  },
];

const LS_KEY = "sr_onboarding_done";

export function useOnboardingDone() {
  return !!localStorage.getItem(LS_KEY);
}

export default function Onboarding({ onDone }) {
  const [step, setStep]       = useState(0);
  const [answers, setAnswers] = useState({ role: null, process: null, volume: null });

  async function complete(finalAnswers) {
    localStorage.setItem(LS_KEY, "1");
    try { await saveOnboarding(finalAnswers); } catch {}
    onDone();
  }

  function skip() { complete(answers); }

  function select(val) {
    setAnswers((p) => ({ ...p, [QUESTIONS[step].key]: val }));
  }

  async function next() {
    if (step < QUESTIONS.length - 1) {
      setStep((s) => s + 1);
    } else {
      await complete(answers);
    }
  }

  const q       = QUESTIONS[step];
  const current = answers[q.key];

  return (
    <div style={{
      position:"fixed", inset:0, background:"#1F2854", zIndex:99999,
      display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 24px",
    }}>
      <div style={{ maxWidth:560, width:"100%" }}>

        {/* Progress pips */}
        <div style={{ display:"flex", gap:6, marginBottom:32 }}>
          {QUESTIONS.map((_, i) => (
            <div key={i} style={{
              height:3, borderRadius:2, flex:1,
              background: i < step ? "#01b88e" : i === step ? "rgba(1,184,142,0.5)" : "rgba(255,255,255,0.15)",
              transition:"background 0.3s",
            }} />
          ))}
        </div>

        {/* Question */}
        <div style={{ fontSize:11, color:"#01b88e", fontWeight:"bold", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>
          Question {step + 1} of {QUESTIONS.length}
        </div>
        <div style={{ fontSize:22, fontWeight:"bold", color:"#fff", lineHeight:1.3, marginBottom:8 }}>{q.q}</div>
        <div style={{ fontSize:13, color:"#7a8db8", marginBottom:28, lineHeight:1.6 }}>{q.sub}</div>

        {/* Options */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {q.options.map((opt) => {
            const selected = current === opt;
            return (
              <div key={opt} onClick={() => select(opt)} style={{
                display:"flex", alignItems:"center", gap:12,
                padding:"12px 16px",
                border:`1px solid ${selected ? "#01b88e" : "rgba(255,255,255,0.12)"}`,
                borderRadius:8, cursor:"pointer",
                background: selected ? "rgba(1,184,142,0.1)" : "transparent",
                transition:"all 0.15s",
              }}>
                <div style={{
                  width:16, height:16, borderRadius:"50%", flexShrink:0,
                  border:`2px solid ${selected ? "#01b88e" : "rgba(255,255,255,0.3)"}`,
                  background: selected ? "#01b88e" : "transparent",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  {selected && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }} />}
                </div>
                <span style={{ fontSize:13, color: selected ? "#fff" : "#c8d0e0", lineHeight:1.4 }}>{opt}</span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:28 }}>
          <button onClick={skip} style={{ fontSize:12, color:"#5a6a8a", background:"none", border:"none", cursor:"pointer", fontFamily:"Arial,sans-serif" }}>
            Skip for now
          </button>
          <button onClick={next} disabled={!current} style={{
            background: current ? "#01b88e" : "rgba(1,184,142,0.35)",
            color:"#fff", border:"none", padding:"11px 28px",
            borderRadius:7, fontSize:13, fontWeight:"bold",
            cursor: current ? "pointer" : "not-allowed",
            fontFamily:"Arial,sans-serif", transition:"background 0.15s",
          }}>
            {step < QUESTIONS.length - 1 ? "Continue" : "Get started"}
          </button>
        </div>
      </div>
    </div>
  );
}