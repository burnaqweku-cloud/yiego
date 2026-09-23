import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/store/auth-context";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import AdminMfa from "@/components/auth/AdminMfa";

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { isAdmin, needsMfa, hasFactor, loading: adminLoading, refresh } = useAdminAccess();

  if (authLoading || adminLoading) {
    return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>;
  }
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (!user || !isAdmin) return <Navigate to="/" replace />;
  if (needsMfa) return <AdminMfa hasFactor={hasFactor} onDone={() => void refresh()} />;
  return <>{children}</>;
}
