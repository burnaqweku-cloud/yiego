import type { User } from '@supabase/supabase-js';

type ProfileLike = {
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
} | null | undefined;

/** Real display name fallback chain: profile.full_name → metadata → username → email prefix → "there" */
export function getDisplayName(profile: ProfileLike, user: User | null): string {
  const meta = (user?.user_metadata || {}) as Record<string, any>;
  const candidates = [
    profile?.full_name,
    meta.full_name,
    meta.name,
    profile?.username,
    meta.username,
    user?.email?.split('@')[0],
  ];
  for (const c of candidates) {
    const v = typeof c === 'string' ? c.trim() : '';
    if (v && v.toLowerCase() !== 'user') return v;
  }
  return 'there';
}

export function getFirstName(profile: ProfileLike, user: User | null): string {
  const name = getDisplayName(profile, user);
  return name.split(/\s+/)[0] || name;
}

export function getUsernameDisplay(profile: ProfileLike, user: User | null): string | null {
  const meta = (user?.user_metadata || {}) as Record<string, any>;
  const candidates = [profile?.username, meta.username];
  for (const c of candidates) {
    const v = typeof c === 'string' ? c.trim() : '';
    if (v && v.toLowerCase() !== 'user') return v;
  }
  return null;
}

export function getInitials(profile: ProfileLike, user: User | null): string {
  const name = getDisplayName(profile, user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || 'U').toUpperCase();
}
