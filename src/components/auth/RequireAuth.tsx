import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/store/auth-context";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>;
  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}
