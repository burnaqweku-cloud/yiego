import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isAdminOrStaff: boolean;
  userRole: 'admin' | 'staff' | 'user' | null;
  profile: { full_name: string; phone: string; email: string | null; username: string | null; avatar_url: string | null } | null;
  signUp: (email: string, password: string, metadata: { full_name: string; phone: string; username: string; loyalty_ref_code?: string }) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [userRole, setUserRole] = useState<AuthContextType['userRole']>(null);
  const [profile, setProfile] = useState<AuthContextType['profile']>(null);

  useEffect(() => {
    let isMounted = true;

    const loadProfileAndRoles = async (userId: string) => {
      await Promise.all([fetchProfile(userId), checkRoles(userId)]);
    };

    // Set up auth state listener FIRST (ongoing changes, does NOT control loading)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => loadProfileAndRoles(session.user.id), 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
          setIsStaff(false);
          setUserRole(null);
        }
      }
    );

    // INITIAL load — await roles before setting loading=false
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await loadProfileAndRoles(session.user.id);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, phone, email, username, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (data) setProfile(data as any);
  };

  const checkRoles = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (data && data.length > 0) {
      const roles = data.map((r: any) => r.role);
      const admin = roles.includes('admin');
      const staff = roles.includes('staff');
      setIsAdmin(admin);
      setIsStaff(staff);
      setUserRole(admin ? 'admin' : staff ? 'staff' : 'user');
    } else {
      setIsAdmin(false);
      setIsStaff(false);
      setUserRole('user');
    }
  };

  const signUp = async (email: string, password: string, metadata: { full_name: string; phone: string; username: string; loyalty_ref_code?: string }) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: metadata,
      },
    });
    // Fire-and-forget welcome SMS (only if signup succeeded and phone is provided)
    if (!error && metadata.phone && data?.user) {
      try {
        supabase.functions.invoke('send-sms', {
          body: {
            to: metadata.phone,
            event_type: 'welcome_sms',
            user_id: data.user.id,
            template_vars: { name: metadata.full_name || 'there' },
          },
        }).catch(() => {}); // fire-and-forget
      } catch {}
    }
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    localStorage.removeItem('yiego_last_dashboard_page');
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setIsStaff(false);
    setUserRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, isStaff, isAdminOrStaff: isAdmin || isStaff, userRole, profile, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
