import { useState } from "react";
import type { SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import api from "../services/api";
import "./Login.css";
import "./Register.css";

function Register() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"tenant" | "owner">("tenant");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post("/auth/register", {
        firstName,
        lastName,
        email,
        password,
        role,
      });

      if (response.status === 201) {
        if (role === "owner") {
          alert(
            "Owner registration successful. Your account is pending verification."
          );
        } else {
          alert("Registration successful. You can now log in.");
        }

        navigate("/login");
      }
    } catch (error: any) {
      setMessage(
        error.response?.data?.message ||
          "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* LEFT SIDE — same dark navy brand panel as Login */}
      <div className="login-brand">
        <div className="login-logo">
          <span className="logo-circle">R.</span>
          <span className="logo-name">RENTA</span>
        </div>

        <div className="login-brand-content">
          <p className="eyebrow">LONG-TERM RENTALS · CALAPAN CITY</p>

          <h1>
            Join a clearer way
            <br />
            to <span>rent</span> long-term.
          </h1>

          <p className="brand-description">
            Whether you're searching for your next place or listing one,
            RENTA gives you transparent details, verified information, and
            immersive 360° views from day one.
          </p>
        </div>

        <div className="login-footer">
          <span>RENTA</span>
          <span>•</span>
          <span>CALAPAN CITY</span>
        </div>
      </div>

      {/* RIGHT SIDE — form panel */}
      <div className="login-panel">
        <div className="login-card register-card">
          <div className="mobile-logo">
            <span className="logo-circle">R.</span>
            <span className="logo-name">RENTA</span>
          </div>

          <div className="login-heading">
            <p className="login-eyebrow">GET STARTED</p>
            <h2>Create account</h2>
            <p>Join RENTA to discover or list a rental.</p>
          </div>

          <form className="login-form register-form" onSubmit={handleSubmit}>
            <div className="name-row">
              <div className="form-group">
                <label htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="Juan"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Dela Cruz"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>

            <div className="form-group">
              <label>Account Type</label>

              <div className="role-toggle">
                <button
                  type="button"
                  className={role === "tenant" ? "role-option active" : "role-option"}
                  onClick={() => setRole("tenant")}
                >
                  <span className="role-title">Prospective Tenant</span>
                  <span className="role-sub">Looking for a place</span>
                </button>

                <button
                  type="button"
                  className={role === "owner" ? "role-option active" : "role-option"}
                  onClick={() => setRole("owner")}
                >
                  <span className="role-title">Property Owner / Manager</span>
                  <span className="role-sub">Listing a rental</span>
                </button>
              </div>
            </div>

            {message && <div className="login-message">{message}</div>}

            <button type="submit" className="login-button" disabled={loading}>
              <span>{loading ? "Creating Account..." : "Register"}</span>
              <span className="button-arrow">→</span>
            </button>
          </form>

          <div className="register-prompt">
            <span>Already have an account?</span>
            <Link to="/login">Login</Link>
          </div>

          <p className="login-note">
            By creating an account, you agree to use RENTA responsibly and
            provide accurate information.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;