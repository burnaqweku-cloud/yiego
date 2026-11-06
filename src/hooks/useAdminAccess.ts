import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth-context";

/* Admin access = on the admin list AND a two-factor (aal2) session. The
   database enforces the same rule, so this hook only decides which screen
   to show: setup, verify, or in. */
export interface AdminGate { is_admin: boolean; aal: "aal1" | "aal2"; has_factor: boolean; role?: "master" | "admin" | null; can_act?: boolean }

export function useAdminAccess() {
  const { user, loading: authLoading } = useAuth();
  const [gate, setGate] = useState<AdminGate | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setGate(null); setLoading(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("admin_gate", {});
    setGate((data as AdminGate) ?? { is_admin: false, aal: "aal1", has_factor: false });
    setLoading(false);
  }, [user]);

  useEffect(() => { if (authLoading) return; setLoading(true); void refresh(); }, [authLoading, refresh]);

  // 6 Nov 2026: only the master admin may act (refunds, retries, pauses, SMS, finance records…). Other admins are
  // view-only; the server refuses their actions, this flag lets pages say so instead of showing a failing button.
  return { isAdmin: Boolean(gate?.is_admin), canAct: Boolean(gate?.can_act), role: gate?.role ?? null, needsMfa: Boolean(gate?.is_admin) && gate?.aal !== "aal2", hasFactor: Boolean(gate?.has_factor), loading: authLoading || loading, refresh };
}
