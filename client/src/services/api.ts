import axios from "axios";

// VITE_API_URL is injected by Vite at build/dev-server start.
// On a phone, localhost points to the phone itself, so use the backend
// Dev Tunnel URL in client/.env.local when testing from another device.
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const apiBaseUrl = (
  configuredApiUrl || "http://localhost:5000/api/v1"
).replace(/\/+$/, "");

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("renta_token");
  const url = String(config.url ?? "");
  const authAttempt = [
    "/auth/login",
    "/auth/register",
    "/auth/verify-otp",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/resend-otp",
  ].some((path) => url.includes(path));

  if (token && !authAttempt) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (config.headers) {
    delete config.headers.Authorization;
  }

  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url ?? "");
    const authAttempt = [
      "/auth/login",
      "/auth/register",
      "/auth/verify-otp",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/resend-otp",
    ].some((path) => url.includes(path));
    const sessionEnded = status === 401 || (status === 403 && error.response?.data?.code === "ACCOUNT_BLOCKED");

    if (!authAttempt && sessionEnded) {
      localStorage.removeItem("renta_token");
      localStorage.removeItem("renta_user");
      sessionStorage.setItem("renta_login_notice", "Your session ended. Sign in again.");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
