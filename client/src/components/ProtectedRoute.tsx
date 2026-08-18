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

  if (user.role !== allowedRole) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return children;
}

export default ProtectedRoute;