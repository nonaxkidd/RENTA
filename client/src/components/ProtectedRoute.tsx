import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

type Role = "tenant" | "owner" | "admin";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRole: Role;
}

function ProtectedRoute({
  children,
  allowedRole,
}: ProtectedRouteProps) {
  const token = localStorage.getItem("renta_token");

  const storedUser = localStorage.getItem("renta_user");

  if (!token || !storedUser) {
    return <Navigate to="/login" replace />;
  }

  const user = JSON.parse(storedUser);
  const home = user.role === "admin" || user.role === "superadmin"
    ? "/admin"
    : user.role === "owner"
      ? "/owner"
      : user.role === "tenant"
        ? "/tenant"
        : "/login";
  const allowed = allowedRole === "admin"
    ? user.role === "admin" || user.role === "superadmin"
    : user.role === allowedRole;

  if (!allowed) {
    return <Navigate to={home} replace />;
  }

  return children;
}

export default ProtectedRoute;