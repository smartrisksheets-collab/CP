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

// ── Global 401 handler — clear token and reload ───────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("sr_token");
      localStorage.removeItem("sr_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);


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
export const extractFigures = (formData) =>
  api.post("/assessment/extract", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const extractCpTerms = (formData) =>
  api.post("/assessment/extract-cp", formData, { headers: { "Content-Type": "multipart/form-data" } });

export const runAssessment = (figures, clientInfo, extractedFigures = null, draftId = null) =>
  api.post("/assessment/run", { figures, clientInfo, extractedFigures, draftId }, { timeout: 180000 });

export const getDraft = () =>
  api.get("/assessment/draft");

export const updateDraftFigures = (draftId, figures) =>
  api.patch(`/assessment/${draftId}/figures`, { figures });


export const generateReport = (assessmentId, narrativeOverrides = {}) =>
  api.post(
    "/assessment/report",
    { assessment_id: assessmentId, narrative_overrides: narrativeOverrides },
    { responseType: "blob" }
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