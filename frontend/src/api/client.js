import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Attach JWT to every request ───────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sr_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Global error handler — 401 logout, JSON errors from blob requests ──
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("sr_token");
      localStorage.removeItem("sr_user");
      window.location.href = "/login";
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

export const logout = () => {
  localStorage.removeItem("sr_token");
  localStorage.removeItem("sr_user");
};


// ── Tenant ────────────────────────────────────────────────────
export const getTenant = (hostname) =>
  api.get(`/tenant/${hostname}`);


// ── Quota ─────────────────────────────────────────────────────
export const getQuotaStatus = () =>
  api.get("/quota/status");


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

export const runAssessment = (figures, clientInfo, extractedFigures = null, draftId = null) =>
  withRetry(() =>
    api.post("/assessment/run", { figures, clientInfo, extractedFigures, draftId }, { timeout: 180000 })
  );

export const previewScores = (figures) =>
  api.post("/assessment/preview", { figures });

export const getDraft = () =>
  api.get("/assessment/draft");

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