import { useState } from "react";
import Seo from "@/components/seo/Seo";
import { LogOut, Moon, Pencil, User } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth-context";
import { useProfile, maskedPhone } from "@/store/profile";
import { useTheme } from "@/store/theme";
import ProfileSheet from "@/components/sheets/ProfileSheet";
import AppearanceSheet from "@/components/sheets/AppearanceSheet";
import SignOutSheet from "@/components/sheets/SignOutSheet";

type Sheet = "profile" | "appearance" | "signout" | null;

export default function Account() {
  const { user } = useAuth();
  const { profile, initials } = useProfile();
  const { mode } = useTheme();
  const [sheet, setSheet] = useState<Sheet>(null);

  return (
    <div className="space-y-6 lg:space-y-8">
      <Seo title="Your Account — DataYego" description="Manage your DataYego account details." path="/account" noindex />
      <PageHeader eyebrow="Account" title="Your account" subtitle="Manage your personal details and preferences." />

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
      <section className="onyx-panel rounded-[24px] p-6">
        <div className="flex items-center gap-4">
          <span className="onyx-avatar h-14 w-14 shrink-0 text-lg">{initials}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg font-semibold text-white">{profile.firstName} {profile.lastName}</h2>
            <p className="truncate text-sm text-muted-foreground">{user?.email ?? profile.email}</p>
            {profile.phone && <p className="mt-1 text-xs text-faint-foreground">{maskedPhone(profile.phone)}</p>}
          </div>
          <Button variant="soft" size="sm" onClick={() => setSheet("profile")}><Pencil size={15} /> Edit</Button>
        </div>
      </section>

      <section className="onyx-panel divide-y divide-white/5 overflow-hidden rounded-[24px] px-3">
        <button type="button" onClick={() => setSheet("profile")} className="flex w-full items-center gap-3 py-4 text-left">
          <User size={18} className="text-primary-glow" />
          <span className="flex-1 text-sm font-semibold text-foreground">Personal details</span>
          <span className="text-xs text-faint-foreground">Name and phone</span>
        </button>
        <button type="button" onClick={() => setSheet("appearance")} className="flex w-full items-center gap-3 py-4 text-left">
          <Moon size={18} className="text-primary-glow" />
          <span className="flex-1 text-sm font-semibold text-foreground">Appearance</span>
          <span className="text-xs capitalize text-faint-foreground">{mode}</span>
        </button>
        <button type="button" onClick={() => setSheet("signout")} className="flex w-full items-center gap-3 py-4 text-left text-danger">
          <LogOut size={18} />
          <span className="flex-1 text-sm font-semibold">Sign out</span>
        </button>
      </section>
      </div>

      <ProfileSheet open={sheet === "profile"} onClose={() => setSheet(null)} />
      <AppearanceSheet open={sheet === "appearance"} onClose={() => setSheet(null)} />
      <SignOutSheet open={sheet === "signout"} onClose={() => setSheet(null)} />
    </div>
  );
}
