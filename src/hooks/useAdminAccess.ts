import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth-context";

/* Admin access = on the admin list AND a two-factor (aal2) session. The
   database enforces the same rule, so this hook only decides which screen
   to show: setup, verify, or in. */
export interface AdminGate { is_admin: boolean; aal: "aal1" | "aal2"; has_factor: boolean; role?: "master" | "admin" | null; can_act?: boolean }

export function useAdminAccess() {
  const { user, session, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const token = session?.access_token ?? null;
  const [checked, setChecked] = useState<{ userId: string; token: string | null; gate: AdminGate } | null>(null);
  const [checking, setChecking] = useState(false);
  const request = useRef(0);
  const identity = useRef({ userId, token });
  identity.current = { userId, token };

  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    if (!userId) { setChecked(null); setChecking(false); return; }
    setChecking(true);
    const denied: AdminGate = { is_admin: false, aal: "aal1", has_factor: false, can_act: false };
    const current = () => sequence === request.current && identity.current.userId === userId && identity.current.token === token;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("admin_gate", {});
      if (current()) setChecked({ userId, token, gate: error ? denied : (data as AdminGate) ?? denied });
    } catch {
      if (current()) setChecked({ userId, token, gate: denied });
    } finally {
      if (current()) setChecking(false);
    }
  }, [userId, token]);

  useEffect(() => {
    if (!authLoading) void refresh();
    return () => { request.current += 1; };
  }, [authLoading, refresh]);

  // Recovered sessions contain a fresh User object even when identity/token are unchanged.
  // Keep same-account content mounted during token rechecks, but disable actions until verified.
  const gate = userId && checked?.userId === userId ? checked.gate : null;
  const loading = authLoading || Boolean(userId && !gate);
  const verified = !checking && checked?.token === token && !loading;

  // 6 Nov 2026: only the master admin may act (refunds, retries, pauses, SMS, finance records…). Other admins are
  // view-only; the server refuses their actions, this flag lets pages say so instead of showing a failing button.
  return { isAdmin: Boolean(gate?.is_admin), canAct: verified && Boolean(gate?.can_act), role: gate?.role ?? null, needsMfa: Boolean(gate?.is_admin) && gate?.aal !== "aal2", hasFactor: Boolean(gate?.has_factor), loading, refresh };
}
