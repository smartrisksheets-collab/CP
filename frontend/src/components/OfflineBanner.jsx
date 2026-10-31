import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { OFFLINE_MESSAGE } from "../api/client.js";

function subscribe(onChange) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const isOnline = () => navigator.onLine;

// Shown on every page while the browser reports no connection, so users know
// before they press a button rather than after a request fails.
export default function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, isOnline, () => true);
  if (online) return null;
  return (
    <div className="sr-offline-banner" role="status">
      <WifiOff size={14} /> {OFFLINE_MESSAGE}
    </div>
  );
}
