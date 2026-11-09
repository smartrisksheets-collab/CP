import { useEffect } from "react";
import {
  endSession, hasPendingRequests, isIdleExpired, isTokenExpired, markActive,
} from "../api/client.js";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];
const WRITE_THROTTLE_MS = 15 * 1000; // pointermove fires constantly; write at most every 15s
const CHECK_EVERY_MS    = 30 * 1000;

// Signs the user out after IDLE_TIMEOUT_MS without input, or once the JWT expires.
// The last-activity time lives in localStorage, so all tabs share one timer.
// Comparing timestamps (not one long setTimeout) keeps it correct after sleep.
export default function useIdleLogout(active) {
  useEffect(() => {
    if (!active) return undefined;

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < WRITE_THROTTLE_MS) return;
      lastWrite = now;
      markActive();
    };

    const check = () => {
      if (!localStorage.getItem("sr_token")) return;
      if (isTokenExpired()) { endSession("expired"); return; }
      // A running upload or AI extraction counts as activity
      if (hasPendingRequests()) { markActive(); return; }
      if (isIdleExpired()) endSession("idle");
    };

    const onVisible = () => { if (document.visibilityState === "visible") check(); };

    // Another tab signed out: follow it, with the same message
    const onStorage = (e) => {
      if (e.key === "sr_token" && e.newValue === null) {
        try {
          const reason = localStorage.getItem("sr_logout_reason");
          if (reason) sessionStorage.setItem("sr_logout_reason", reason);
        } catch { /* storage blocked */ }
        window.location.replace("/login");
      }
    };

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    check();

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true }));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [active]);
}
