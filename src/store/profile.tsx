import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Live user profile + preferences — editable from the Account page. */

export interface NotifPrefs {
  txAlerts: boolean;
  promos: boolean;
  security: boolean;
}

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  language: string;
  pinSet: boolean;
  notifs: NotifPrefs;
}

const STORAGE_KEY = "yiego_profile_v1";

const DEFAULT_PROFILE: Profile = {
  firstName: "Kwame",
  lastName: "Mensah",
  email: "kwame@yiego.com",
  phone: "0244001122",
  language: "English",
  pinSet: false,
  notifs: { txAlerts: true, promos: false, security: true },
};

interface ProfileValue {
  profile: Profile;
  initials: string;
  update: (patch: Partial<Profile>) => void;
  setNotifs: (patch: Partial<NotifPrefs>) => void;
}

const ProfileContext = createContext<ProfileValue | null>(null);

function load(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      if (p && typeof p.firstName === "string" && p.notifs) return { ...DEFAULT_PROFILE, ...p };
    }
  } catch {
    /* reseed */
  }
  return DEFAULT_PROFILE;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      /* non-fatal */
    }
  }, [profile]);

  const initials =
    `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase() || "YG";

  return (
    <ProfileContext.Provider
      value={{
        profile,
        initials,
        update: (patch) => setProfile((p) => ({ ...p, ...patch })),
        setNotifs: (patch) => setProfile((p) => ({ ...p, notifs: { ...p.notifs, ...patch } })),
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}

/** "024 ••• 122"-style display for a 10-digit phone. */
export function maskedPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)} ••• ${d.slice(7)}` : phone;
}
