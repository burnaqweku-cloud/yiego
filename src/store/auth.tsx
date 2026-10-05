import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { deviceHash } from "@/lib/device";
import { clearInvite, pendingInvite, recordDevice } from "@/lib/referrals";
import { toast } from "sonner";
import { isStoreHost } from "@/lib/storeHost";

/* Store-owned accounts: created on an agent's store, they live there. On the main site
   that login is refused and the person is sent to their store. */
const STORE_SIGNUP_KEY = "yiego_signup_store";
export const setSignupStore = (slug: string | null) => { if (slug) localStorage.setItem(STORE_SIGNUP_KEY, slug); else localStorage.removeItem(STORE_SIGNUP_KEY); };
async function enforceHomeStore(session: Session | null) {
  if (!session) return;
  const path = window.location.pathname;
  if (path.startsWith("/s/") || isStoreHost()) return;
  try {
    const { data } = await (supabase as unknown as { schema: (s: string) => { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: { slug: string; store_name: string } | null }> } }).schema("phase1").rpc("my_home_store", {});
    if (data?.slug) {
      await supabase.auth.signOut();
      toast.error(`This account belongs to ${data.store_name}. Sign in at datayego.com/s/${data.slug}, or create a separate DataYego account with a different email.`, { duration: 9000 });
      window.location.assign(`/s/${data.slug}/sign-in`);
    }
  } catch { /* ignore */ }
}
import { AuthContext, type AuthValue } from "@/store/auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession && (_event === "SIGNED_IN" || _event === "INITIAL_SESSION")) { void recordDevice(); void enforceHomeStore(nextSession); }
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAuthenticated: Boolean(session?.user),
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      },
      async signUp(input) {
        const { data, error } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: {
              full_name: input.fullName,
              phone: input.phone,
              ref: pendingInvite() ?? undefined,
              store: localStorage.getItem(STORE_SIGNUP_KEY) ?? undefined,
              device: await deviceHash().catch(() => undefined),
            },
          },
        });

        if (error) throw error;
        clearInvite(); setSignupStore(null);
        // Fire a welcome email (best-effort). Only possible when signup returns
        // a session (auto-confirm on); it never blocks or fails the signup.
        if (data.session) {
          void supabase.functions
            .invoke("send-welcome-email", { headers: { Authorization: `Bearer ${data.session.access_token}` } })
            .catch(() => {});
        }
        return { requiresEmailConfirmation: !data.session };
      },
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();

        if (error) throw error;
      },
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
