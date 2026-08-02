import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth-context";

interface DbError { message: string }
interface QueryChain<T> extends PromiseLike<{ data: T; error: DbError | null }> {
  select: (columns: string) => QueryChain<T>;
  eq: (column: string, value: unknown) => QueryChain<T>;
  maybeSingle: () => Promise<{ data: T | null; error: DbError | null }>;
}
interface Phase1Client { from: <T>(table: string) => QueryChain<T> }

function phase1() {
  return (supabase as unknown as { schema: (schema: string) => Phase1Client }).schema("phase1");
}

export function useAdminAccess() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    phase1()
      .from<{ user_id: string }>("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        setIsAdmin(Boolean(data));
        setLoading(false);
      });

    return () => { mounted = false; };
  }, [authLoading, user]);

  return { isAdmin, loading: authLoading || loading };
}
