import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ListingDetail from "./pages/ListingDetail";
import ComparePage from "./pages/ComparePage";
import TenantDashboard from "./pages/TenantDashboard";
import OwnerDashboard from "./pages/OwnerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route
          path="/"
          element={<Landing />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />

        <Route
          path="/listings/:id"
          element={<ListingDetail />}
        />

        <Route
          path="/compare"
          element={
            <ProtectedRoute allowedRole="tenant">
              <ComparePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tenant"
          element={
            <ProtectedRoute allowedRole="tenant">
              <TenantDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/owner"
          element={
            <ProtectedRoute allowedRole="owner">
              <OwnerDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;