import { useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

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
    <div>
      <h1>RENTA</h1>

      <h2>Login</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Email</label>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />
        </div>

        <div>
          <label>Password</label>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
          />
        </div>

        <button type="submit">
          Login
        </button>
      </form>
        <p>
        Don't have an account?{" "}
        <Link to="/register">
            Register
        </Link>
        </p>
      {message && <p>{message}</p>}
    </div>
  );
}

export default Login;