export function homeForRole(role?: string) {
  if (role === "owner") return "/owner";
  if (role === "tenant") return "/tenant";
  if (role === "admin" || role === "superadmin") return "/admin";
  return "/";
}
