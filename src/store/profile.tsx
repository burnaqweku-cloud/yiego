import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth-context";

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface ProfileValue {
  profile: Profile;
  initials: string;
  update: (patch: Partial<Profile>) => Promise<void>;
  loading: boolean;
  isRealProfile: boolean;
}

interface DbError { message: string }
interface QueryChain<T> extends PromiseLike<{ data: T; error: DbError | null }> {
  select: (columns?: string) => QueryChain<T>;
  eq: (column: string, value: unknown) => QueryChain<T>;
  update: (values: Record<string, unknown>) => QueryChain<T>;
  maybeSingle: () => Promise<{ data: T | null; error: DbError | null }>;
}
interface Phase1Client { from: <T>(table: string) => QueryChain<T> }
interface ProfileRow { full_name: string | null; email: string | null; phone: string | null }

const EMPTY: Profile = { firstName: "Guest", lastName: "", email: "", phone: "" };
const ProfileContext = createContext<ProfileValue | null>(null);

function phase1() {
  return (supabase as unknown as { schema: (schema: string) => Phase1Client }).schema("phase1");
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [isRealProfile, setIsRealProfile] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) {
      setProfile(EMPTY);
      setIsRealProfile(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    phase1().from<ProfileRow>("profiles").select("full_name, email, phone").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (!mounted) return;
      const parts = (data?.full_name || user.user_metadata.full_name || user.email || "YieGo User").trim().split(/\s+/);
      setProfile({
        firstName: parts[0] || "YieGo",
        lastName: parts.slice(1).join(" "),
        email: data?.email ?? user.email ?? "",
        phone: data?.phone ?? String(user.user_metadata.phone ?? ""),
      });
      setIsRealProfile(Boolean(data));
      setLoading(false);
    });

    return () => { mounted = false; };
  }, [authLoading, isAuthenticated, user]);

  const update = (patch: Partial<Profile>) => {
    if (!user) return Promise.reject(new Error("Authentication required"));
    const next = { ...profile, ...patch, email: profile.email };
    return phase1().from("profiles").update({ full_name: `${next.firstName} ${next.lastName}`.trim(), phone: next.phone }).eq("id", user.id).then(({ error }) => {
      if (error) throw new Error(error.message);
      setProfile(next);
    });
  };

  const initials = isAuthenticated ? (`${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase() || "YG") : "";
  return <ProfileContext.Provider value={{ profile, initials, update, loading, isRealProfile }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile must be used within a ProfileProvider");
  return value;
}

export function maskedPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)} ••• ${digits.slice(7)}` : phone;
}
