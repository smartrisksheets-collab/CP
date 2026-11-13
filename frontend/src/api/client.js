import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Session lifetime ──────────────────────────────────────────
// Idle limit in minutes; VITE_IDLE_TIMEOUT_MINUTES overrides it (handy for testing)
export const IDLE_TIMEOUT_MS = (Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES) || 60) * 60 * 1000;
const EXP_LEEWAY_MS = 30 * 1000;           // tolerate a client clock running slightly fast
const LAST_ACTIVE_KEY = "sr_last_active";  // shared by all tabs of this origin
const REASON_KEY      = "sr_logout_reason";

let pendingRequests = 0;
export const hasPendingRequests = () => pendingRequests > 0;

export function markActive() {
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* storage blocked */ }
}

export function lastActive() {
  const v = Number(localStorage.getItem(LAST_ACTIVE_KEY));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function isIdleExpired(now = Date.now()) {
  const last = lastActive();
  return last !== null && now - last >= IDLE_TIMEOUT_MS;
}

// Reads exp from the JWT payload. A token that cannot be decoded counts as expired.
export function isTokenExpired(token = localStorage.getItem("sr_token"), now = Date.now()) {
  if (!token) return false;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
    if (typeof exp !== "number") return false; // no exp claim: the server decides
    return now >= exp * 1000 + EXP_LEEWAY_MS;
  } catch {
    return true;
  }
}

// Ends the session. reason: "idle" | "expired" | "ended" | null (manual sign out).
// The reason goes to sessionStorage for the login page, and to localStorage
// briefly so other open tabs can show the same message.
export function endSession(reason = null, { redirect = true } = {}) {
  try {
    if (reason) {
      sessionStorage.setItem(REASON_KEY, reason);
      localStorage.setItem(REASON_KEY, reason);
    } else {
      localStorage.removeItem(REASON_KEY);
    }
    localStorage.removeItem("sr_token");
    localStorage.removeItem("sr_user");
    localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch { /* storage blocked */ }
  if (redirect && window.location.pathname !== "/login") window.location.replace("/login");
}

// Login page: read once, then clear
export function takeLogoutReason() {
  try {
    const r = sessionStorage.getItem(REASON_KEY);
    sessionStorage.removeItem(REASON_KEY);
    return r;
  } catch {
    return null;
  }
}

// ── Attach JWT to every request ───────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sr_token");
  if (token) {
    if (isTokenExpired(token)) {
      endSession("expired");
      return Promise.reject(new axios.CanceledError("Session expired"));
    }
    config.headers.Authorization = `Bearer ${token}`;
  }
  pendingRequests += 1;
  config._srTracked = true;
  return config;
});

// ── Global error handler — 401 logout, JSON errors from blob requests ──
const settle = (config) => {
  if (config?._srTracked) {
    config._srTracked = false;
    pendingRequests = Math.max(0, pendingRequests - 1);
  }
};

api.interceptors.response.use(
  (res) => { settle(res.config); return res; },
  async (err) => {
    settle(err.config);
    // Only a request that carried a token can mean the session ended (expired,
    // revoked). A 401 on a public call, such as login, is left to the page.
    if (err.response?.status === 401 && err.config?.headers?.Authorization) {
      endSession("ended");
    }
    // Report downloads use responseType "blob", so their error bodies arrive as a Blob
    const data = err.response?.data;
    if (data instanceof Blob && data.type.includes("json")) {
      try { err.response.data = JSON.parse(await data.text()); } catch { /* keep the blob; errorMessage falls back */ }
    }
    return Promise.reject(err);
  }
);

// ── User-facing error text ────────────────────────────────────
export const OFFLINE_MESSAGE = "No internet connection. Check your connection and try again.";

// Turns any request error into one plain sentence for the UI. Order matters:
// offline first, then no response, then the server's own message, then by status.
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE_MESSAGE;

  if (!err?.response) {
    if (err?.code === "ERR_CANCELED") return fallback;
    if (err?.code === "ECONNABORTED" || err?.code === "ETIMEDOUT") {
      return "The server took too long to respond. Check your internet connection and try again.";
    }
    // No response at all: network drop, DNS, server asleep, or an error page without CORS headers
    return "Cannot reach SmartRisk. Check your internet connection, or try again in a minute.";
  }

  const { status, data } = err.response;
  const detail = data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof detail?.message === "string" && detail.message.trim()) return detail.message;

  if (status === 429) return "Too many requests. Please wait a minute and try again.";
  if (status === 413) return "The upload is too large. Use a smaller file.";
  if (status === 422) return "Some of the details sent were not valid. Check the form and try again.";
  if (status === 502 || status === 503 || status === 504) {
    return "SmartRisk is temporarily unavailable. Check your internet connection, or try again in a minute.";
  }
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return fallback;
}


async function withRetry(fn, maxAttempts = 2) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isNetworkError = !err.response && err.code !== "ECONNABORTED";
      if (isNetworkError && attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000 * attempt)); // 2s, 4s backoff
        continue;
      }
      throw err;
    }
  }
}


// ── Auth ──────────────────────────────────────────────────────
export const requestOTP = (email, hostname, code) =>
  api.post("/auth/request-otp", { email, hostname, code });

export const verifyOTP = (email, hostname, otp) =>
  api.post("/auth/verify-otp", { email, hostname, otp });

export const getMe = () =>
  api.get("/auth/me");

export const logout = () => endSession(null, { redirect: false });


// ── Tenant ────────────────────────────────────────────────────
export const getTenant = (hostname) =>
  api.get(`/tenant/${hostname}`);


// ── Quota ─────────────────────────────────────────────────────
export const getQuotaStatus = () =>
  api.get("/quota/status");


// ── Payments ──────────────────────────────────────────────────
export const getPacks = () =>
  api.get("/payments/packs");

export const initializePayment = (pack, hostname) =>
  api.post("/payments/initialize", { pack, hostname });

export const verifyPayment = (reference) =>
  api.get(`/payments/verify/${encodeURIComponent(reference)}`);


// ── Assessment ────────────────────────────────────────────────
export const extractFigures = (formData, onUploadProgress) =>
  withRetry(() =>
    api.post("/assessment/extract", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 600000, // scanned documents and backend AI retries can take minutes; a client timeout here still charges a credit
      onUploadProgress,
    })
  );

export const extractCpTerms = (formData) =>
  api.post("/assessment/extract-cp", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 330000, // one AI call can take up to 300s on a long scanned document
  });

// Bond or note terms from a pricing supplement or term sheet (D052)
export const extractInstrumentTerms = (formData) =>
  api.post("/assessment/extract-terms", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 330000,
  });

export const runAssessment = (figures, clientInfo, extractedFigures = null, draftId = null) =>
  withRetry(() =>
    api.post("/assessment/run", { figures, clientInfo, extractedFigures, draftId }, { timeout: 180000 })
  );

export const previewScores = (figures) =>
  api.post("/assessment/preview", { figures });

export const getDraft = () =>
  api.get("/assessment/draft");

export const getIssuerHistory = (rcNumber) =>
  api.get(`/assessment/issuer/${encodeURIComponent(rcNumber)}`);

export const updateDraftFigures = (draftId, figures) =>
  api.patch(`/assessment/${draftId}/figures`, { figures });


export const generateReport = (assessmentId, narrativeOverrides = {}) =>
  api.post(
    "/assessment/report",
    { assessment_id: assessmentId, narrative_overrides: narrativeOverrides },
    { responseType: "blob", timeout: 60000 }
  );

export const getHistory = (page = 1, pageSize = 20) =>
  api.get("/assessment/history", { params: { page, page_size: pageSize } });

export const deleteAssessment = (id) =>
  api.delete(`/assessment/${id}`);

export const getAssessment = (id) =>
  api.get(`/assessment/${id}`);

export const updateNarrative = (id, narrative) =>
  api.patch(`/assessment/${id}/narrative`, { narrative });

export const saveOnboarding = (data) =>
  api.post("/auth/onboarding", data);

// ── Admin ─────────────────────────────────────────────────────
export const adminGetUsers = () =>
  api.get("/admin/users");

export const adminGetStats = () =>
  api.get("/admin/stats");

export const adminAdjustCredits = (email, amount, reason) =>
  api.post("/admin/users/credits", { email, amount, reason });

export const adminSetRole = (email, role) =>
  api.post("/admin/users/role", { email, role });

export const adminGetAllowlist = () =>
  api.get("/admin/allowlist");

export const adminAddAllowlist = (email, note) =>
  api.post("/admin/allowlist", { email, note });

export const adminRevokeAllowlist = (email) =>
  api.post("/admin/allowlist/revoke", { email });
