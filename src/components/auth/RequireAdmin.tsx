import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/store/auth-context";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdminAccess();

  if (authLoading || adminLoading) {
    return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>;
  }
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (!user || !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
