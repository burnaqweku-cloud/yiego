import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface SignUpResult {
  requiresEmailConfirmation: boolean;
}

export interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
