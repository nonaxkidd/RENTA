import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("renta_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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