import { useNavigate } from "react-router-dom";

function TenantDashboard() {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("renta_token");
    localStorage.removeItem("renta_user");

    navigate("/login");
  }

  return (
    <div>
      <h1>RENTA</h1>
      <h2>Tenant Dashboard</h2>

      <button onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}

export default TenantDashboard;