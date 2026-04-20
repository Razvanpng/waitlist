import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth } from "@/features/auth/RequireAuth";

// placeholders — replaced per phase
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { DashboardPage } from "@/pages/admin/DashboardPage";
import { ClientDashboardPage } from "@/pages/client/DashboardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function AppRoutes() {
  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* admin-only */}
      <Route element={<RequireAuth allowedRole="admin" />}>
        <Route path="/admin/dashboard" element={<DashboardPage />} />
      </Route>

      {/* client-only */}
      <Route element={<RequireAuth allowedRole="client" />}>
        <Route path="/client/dashboard" element={<ClientDashboardPage />} />
      </Route>

      {/* fallbacks */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}