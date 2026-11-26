import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import api from "../services/api";
import { homeForRole } from "../utils/roles";
import "./Login.css";

type Mode = "login" | "verify" | "forgot" | "reset";

const demoLogins = import.meta.env.DEV
  ? [
      { label: "Tenant", email: "tenant@gmail.com", password: "Tenant12345!" },
      { label: "Owner", email: "owner@gmail.com", password: "Owner12345!" },
      { label: "Admin", email: "admin@renta.local", password: "Admin12345!" },
      { label: "Superadmin", email: "superadmin@renta.local", password: "SuperAdmin12345!" },
    ]
  : [];

function Login() {
  const navigate = useNavigate();

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [message, setMessage] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    const notice = sessionStorage.getItem("renta_login_notice");
    if (!notice) return;
    sessionStorage.removeItem("renta_login_notice");
    setMessage(notice);
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  function storeSession(token: string, user: { role?: string }) {
    localStorage.setItem("renta_token", token);
    localStorage.setItem("renta_user", JSON.stringify(user));
    navigate(homeForRole(user.role));
  }

  function readTypedEmail() {
    const typed = emailRef.current?.value ?? email;
    return typed.trim();
  }

  async function signIn(emailAddress: string, secret: string) {
    const submittedEmail = emailAddress.trim();
    setEmail(submittedEmail);
    if (emailRef.current) emailRef.current.value = submittedEmail;
    if (passwordRef.current) passwordRef.current.value = secret;
    try {
      setMessage("");
      const response = await api.post("/auth/login", { email: submittedEmail, password: secret });
      storeSession(response.data.token, response.data.user);
    } catch (error: any) {
      if (error.response?.data?.needsOtp) {
        setMode("verify");
        setResendIn(60);
      }
      setMessage(error.response?.data?.message || "Unable to login");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const emailInput = form.elements.namedItem("email");
    const passwordInput = form.elements.namedItem("password");
    const submittedEmail = emailInput instanceof HTMLInputElement ? emailInput.value : "";
    const submittedPassword = passwordInput instanceof HTMLInputElement ? passwordInput.value : "";
    await signIn(submittedEmail, submittedPassword);
  }

  async function handleVerifyOtp(event: FormEvent) {
    event.preventDefault();
    try {
      setMessage("");
      const response = await api.post("/auth/verify-otp", { email: readTypedEmail(), code: otpCode.trim() });
      storeSession(response.data.token, response.data.user);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "That code could not be verified.");
    }
  }

  async function handleResendLoginCode() {
    if (resendIn > 0) return;
    try {
      setMessage("");
      const response = await api.post("/auth/resend-otp", { email: readTypedEmail() });
      setMessage(response.data.message || "A new code was sent.");
      setResendIn(60);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "Couldn't resend the code.");
    }
  }

  async function handleForgot(event: FormEvent) {
    event.preventDefault();
    try {
      setMessage("");
      const response = await api.post("/auth/forgot-password", { email: readTypedEmail() });
      setMessage(response.data.message);
      setMode("reset");
      setResendIn(60);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "Couldn't start password reset.");
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    try {
      setMessage("");
      const response = await api.post("/auth/reset-password", {
        email: readTypedEmail(),
        code: otpCode.trim(),
        password: newPassword,
      });
      setMessage(response.data.message);
      setMode("login");
      setOtpCode("");
      setNewPassword("");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "Couldn't reset the password.");
    }
  }

  async function handleResendReset() {
    if (resendIn > 0) return;
    try {
      const response = await api.post("/auth/forgot-password", { email: readTypedEmail() });
      setMessage(response.data.message);
      setResendIn(60);
    } catch (error: any) {
      setMessage(error.response?.data?.message || "Couldn't resend the code.");
    }
  }

  const submit = mode === "verify" ? handleVerifyOtp : mode === "forgot" ? handleForgot : mode === "reset" ? handleReset : handleSubmit;

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="login-logo">
          <span className="logo-circle">R.</span>
          <span className="logo-name">RENTA</span>
        </div>
        <div className="login-brand-content">
          <p className="eyebrow">LONG-TERM RENTALS · CALAPAN CITY</p>
          <h1>
            Find your next place.
            <br />
            <span>Know it</span> before you go.
          </h1>
          <p className="brand-description">
            Discover verified long-term rentals with transparent listing details and photos.
          </p>
        </div>
        <div className="login-footer">
          <span>RENTA</span>
          <span>•</span>
          <span>CALAPAN CITY</span>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <Link to="/" className="auth-back">← Back to home</Link>
          <div className="mobile-logo">
            <span className="logo-circle">R.</span>
            <span className="logo-name">RENTA</span>
          </div>
          <div className="login-heading">
            <p className="login-eyebrow">WELCOME BACK</p>
            <h2>{mode === "forgot" || mode === "reset" ? "Reset password" : "Sign in"}</h2>
            <p>
              {mode === "forgot"
                ? "We'll send a code if this email is registered."
                : mode === "reset"
                  ? "Enter the code and choose a new password."
                  : "Access your RENTA account."}
            </p>
          </div>

          <form className="login-form" onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                ref={emailRef}
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="you@example.com"
                onInput={(event) => setEmail(event.currentTarget.value)}
                required
              />
            </div>

            {mode === "login" && (
              <div className="form-group">
                <div className="password-label">
                  <label htmlFor="password">Password</label>
                  <button type="button" className="forgot-button" onClick={() => { setMode("forgot"); setMessage(""); }}>
                    Forgot password?
                  </button>
                </div>
                <input
                  id="password"
                  ref={passwordRef}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Enter your password"
                  required
                />
              </div>
            )}

            {mode === "verify" && (
              <div className="form-group">
                <label htmlFor="otp">Gmail verification code</label>
                <input id="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} required />
                <button type="button" className="forgot-button" onClick={handleResendLoginCode} disabled={resendIn > 0}>
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                </button>
              </div>
            )}

            {mode === "reset" && (
              <>
                <div className="form-group">
                  <label htmlFor="otp">Reset code</label>
                  <input id="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} required />
                  <button type="button" className="forgot-button" onClick={handleResendReset} disabled={resendIn > 0}>
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                  </button>
                </div>
                <div className="form-group">
                  <label htmlFor="new-password">New password</label>
                  <input id="new-password" type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                </div>
              </>
            )}

            {message && <div className="login-message">{message}</div>}

            <button type="submit" className="login-button">
              <span>{mode === "forgot" ? "Send code" : mode === "reset" ? "Save password" : mode === "verify" ? "Verify" : "Sign in"}</span>
              <span className="button-arrow">→</span>
            </button>

            {mode === "login" && demoLogins.length > 0 && (
              <div className="demo-logins">
                <span>Demo</span>
                {demoLogins.map((account) => (
                  <button key={account.email} type="button" onClick={() => void signIn(account.email, account.password)}>
                    {account.label}
                  </button>
                ))}
              </div>
            )}
          </form>

          {(mode === "forgot" || mode === "reset" || mode === "verify") && (
            <button type="button" className="forgot-button" onClick={() => { setMode("login"); setMessage(""); }}>
              Back to sign in
            </button>
          )}

          <div className="register-prompt">
            <span>Don't have an account?</span>
            <Link to="/register">Create an account</Link>
          </div>
          <p className="login-note">By continuing, you agree to use RENTA responsibly and provide accurate information.</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
