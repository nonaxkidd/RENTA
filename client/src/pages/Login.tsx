import { useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import api from "../services/api";
import "./Login.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    try {
      setMessage("");

      const response = await api.post("/auth/login", {
        email,
        password,
      });

      const { token, user } = response.data;

      localStorage.setItem("renta_token", token);
      localStorage.setItem(
        "renta_user",
        JSON.stringify(user)
      );

      if (user.role === "tenant") {
        navigate("/tenant");
      } else if (user.role === "owner") {
        navigate("/owner");
      } else if (user.role === "admin") {
        navigate("/admin");
      }
    } catch (error: any) {
      setMessage(
        error.response?.data?.message ||
          "Unable to login"
      );
    }
  }

  return (
    <div className="login-page">

      {/* Left branding section */}
      <div className="login-brand">

        <div className="login-logo">
          <span className="logo-circle">R.</span>
          <span className="logo-name">RENTA</span>
        </div>

        <div className="login-brand-content">
          <p className="eyebrow">
            LONG-TERM RENTALS · CALAPAN CITY
          </p>

          <h1>
            Find your next place.
            <br />
            <span>Know it</span> before you go.
          </h1>

          <p className="brand-description">
            Discover verified long-term rentals with
            transparent listing details, approximate
            locations, and immersive 360° views.
          </p>
        </div>

        <div className="login-footer">
          <span>RENTA</span>
          <span>•</span>
          <span>CALAPAN CITY</span>
        </div>

      </div>


      {/* Right login section */}
      <div className="login-panel">

        <div className="login-card">

          <div className="mobile-logo">
            <span className="logo-circle">R.</span>
            <span className="logo-name">RENTA</span>
          </div>

          <div className="login-heading">
            <p className="login-eyebrow">
              WELCOME BACK
            </p>

            <h2>Sign in</h2>

            <p>
              Access your RENTA account.
            </p>
          </div>


          <form
            className="login-form"
            onSubmit={handleSubmit}
          >

            <div className="form-group">
              <label htmlFor="email">
                Email
              </label>

              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
              />
            </div>


            <div className="form-group">
              <div className="password-label">
                <label htmlFor="password">
                  Password
                </label>

                <button
                  type="button"
                  className="forgot-button"
                  onClick={() =>
                    setMessage(
                      "Password recovery will be available soon."
                    )
                  }
                >
                  Forgot password?
                </button>
              </div>

              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
              />
            </div>


            {message && (
              <div className="login-message">
                {message}
              </div>
            )}


            <button
              type="submit"
              className="login-button"
            >
              <span>Sign in</span>
              <span className="button-arrow">→</span>
            </button>

          </form>


          <div className="register-prompt">
            <span>Don't have an account?</span>

            <Link to="/register">
              Create an account
            </Link>
          </div>


          <p className="login-note">
            By continuing, you agree to use RENTA
            responsibly and provide accurate information.
          </p>

        </div>

      </div>

    </div>
  );
}

export default Login;