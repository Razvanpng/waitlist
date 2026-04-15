import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore, type UserRole } from "@/store/authSlice";

interface RequireAuthProps {
  allowedRole: UserRole;
}

export function RequireAuth({ allowedRole }: RequireAuthProps) {
  const { session, role, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role !== allowedRole) {
    // authenticated but wrong role — redirect to their own dashboard
    const fallback = role === "admin" ? "/admin/dashboard" : "/client/dashboard";
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}