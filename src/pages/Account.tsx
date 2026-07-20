import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PageHeader from "@/components/layout/PageHeader";
import ListRow from "@/components/ui/list-row";
import { Button } from "@/components/ui/button";
import { useProfile, maskedPhone } from "@/store/profile";
import ProfileSheet from "@/components/sheets/ProfileSheet";
import PinSheet from "@/components/sheets/PinSheet";
import NotificationPrefsSheet from "@/components/sheets/NotificationPrefsSheet";
import LimitsSheet from "@/components/sheets/LimitsSheet";
import StatementsSheet from "@/components/sheets/StatementsSheet";
import HelpSheet from "@/components/sheets/HelpSheet";
import ContactSheet from "@/components/sheets/ContactSheet";
import TermsSheet from "@/components/sheets/TermsSheet";
import AppearanceSheet from "@/components/sheets/AppearanceSheet";
import LanguageSheet from "@/components/sheets/LanguageSheet";
import SignOutSheet from "@/components/sheets/SignOutSheet";
import ReferralSheet, { referralCode } from "@/components/sheets/ReferralSheet";
import {
  User,
  Lock,
  Bell,
  Banknote,
  ShieldCheck,
  FileText,
  Moon,
  Globe,
  LifeBuoy,
  MessageSquare,
  LogOut,
  Pencil,
  Gauge,
  Gift,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

const DAILY_LIMIT = "GH₵ 50,000";

type SheetId =
  | "profile"
  | "pin"
  | "notifs"
  | "limits"
  | "statements"
  | "help"
  | "contact"
  | "terms"
  | "appearance"
  | "language"
  | "referral"
  | "signout";

interface SettingItem {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  value?: string;
  onClick: () => void;
}

interface SettingGroup {
  label: string;
  items: SettingItem[];
}

/* ── Neutral leading icon chip for each settings row ───────────── */
function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground">
      <Icon size={17} strokeWidth={1.9} />
    </span>
  );
}

/* ── A labelled group of settings rows inside one glass panel ──── */
function SettingsGroup({ group, delay }: { group: SettingGroup; delay: string }) {
  return (
    <section className="onyx-rise" style={{ animationDelay: delay }}>
      <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
        {group.label}
      </p>
      <div className="onyx-panel divide-y divide-white/5 overflow-hidden rounded-[22px] px-2.5 py-1">
        {group.items.map((item) => (
          <ListRow
            key={item.title}
            icon={<IconChip icon={item.icon} />}
            title={item.title}
            subtitle={item.subtitle}
            right={
              item.value ? (
                <span className="text-[13px] font-medium text-muted-foreground">{item.value}</span>
              ) : undefined
            }
            chevron
            onClick={item.onClick}
          />
        ))}
      </div>
    </section>
  );
}

export default function Account() {
  const { profile, initials } = useProfile();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<SheetId | null>(null);

  const open = (id: SheetId) => () => setSheet(id);
  const close = () => setSheet(null);

  const goToPayoutMethods = () => {
    toast("Manage payout methods on the Wallet page");
    navigate("/wallet");
  };

  const notifsOn = Object.values(profile.notifs).filter(Boolean).length;

  const groups: SettingGroup[] = [
    {
      label: "Personal",
      items: [
        { icon: User, title: "Personal details", onClick: open("profile") },
        {
          icon: Lock,
          title: "Security & PIN",
          subtitle: profile.pinSet ? "PIN set" : "Not set",
          onClick: open("pin"),
        },
        { icon: Bell, title: "Notifications", value: `${notifsOn} on`, onClick: open("notifs") },
      ],
    },
    {
      label: "Money",
      items: [
        { icon: Banknote, title: "Payout methods", onClick: goToPayoutMethods },
        {
          icon: ShieldCheck,
          title: "Limits & verification",
          subtitle: "Tier 2",
          onClick: open("limits"),
        },
        { icon: FileText, title: "Statements", onClick: open("statements") },
      ],
    },
    {
      label: "Preferences",
      items: [
        { icon: Moon, title: "Appearance", value: "Onyx Dark", onClick: open("appearance") },
        { icon: Globe, title: "Language", value: profile.language, onClick: open("language") },
      ],
    },
    {
      label: "Support",
      items: [
        { icon: LifeBuoy, title: "Help center", onClick: open("help") },
        { icon: MessageSquare, title: "Contact support", onClick: open("contact") },
        { icon: FileText, title: "Terms & Privacy", onClick: open("terms") },
      ],
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Your account"
        subtitle="Profile, security and preferences."
      />

      {/* Profile — the prominent header card */}
      <div
        className="onyx-panel onyx-rise rounded-[22px] p-6"
        style={{ animationDelay: "60ms" }}
      >
        <div className="flex items-start gap-4">
          <span
            className="onyx-avatar h-14 w-14 shrink-0 text-[18px] sm:h-16 sm:w-16 sm:text-[20px]"
            aria-hidden="true"
          >
            {initials}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg font-semibold tracking-tight text-white">
              {profile.firstName} {profile.lastName}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {profile.email} · {maskedPhone(profile.phone)}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={open("profile")}
            aria-label="Edit profile"
            className="h-11 shrink-0"
          >
            <Pencil size={15} />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        </div>

        {/* Status chips */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-glow/20 bg-primary/[0.12] px-3 py-1 text-[12px] font-semibold text-primary-glow">
            <ShieldCheck size={13} />
            Verified · Tier 2
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] font-medium text-muted-foreground">
            <Gauge size={13} className="text-faint-foreground" />
            Daily limit · <span className="tnum text-foreground">{DAILY_LIMIT}</span>
          </span>
        </div>
      </div>

      {/* Invite friends — the referral standout */}
      <section className="onyx-rise" style={{ animationDelay: "90ms" }}>
        <button
          type="button"
          onClick={open("referral")}
          className="onyx-dev group relative w-full overflow-hidden rounded-[22px] p-5 text-left transition-transform duration-200 hover:-translate-y-0.5 sm:p-6"
        >
          <span className="onyx-dev-glow" aria-hidden="true" />
          <div className="relative flex items-center gap-4">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] border border-primary-glow/25 bg-gradient-to-b from-primary/[0.22] to-primary/[0.04] text-primary-glow shadow-[0_0_24px_-6px_rgba(34,195,135,0.55)]"
              aria-hidden="true"
            >
              <Gift size={21} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[15.5px] font-semibold tracking-tight text-white">
                Give GH₵5, get GH₵5
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                Invite friends — you both get GH₵5 on their first purchase.
              </p>
              <span className="mt-2.5 inline-flex items-center rounded-lg border border-dashed border-primary-glow/30 bg-primary/[0.07] px-2.5 py-1 font-mono text-[12px] font-semibold tracking-[0.1em] text-primary-glow">
                {referralCode(profile.firstName)}
              </span>
            </div>
            <ChevronRight
              size={18}
              className="shrink-0 text-faint-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary-glow"
              aria-hidden="true"
            />
          </div>
        </button>
      </section>

      {/* Settings groups */}
      <SettingsGroup group={groups[0]} delay="120ms" />
      <SettingsGroup group={groups[1]} delay="180ms" />
      <SettingsGroup group={groups[2]} delay="240ms" />
      <SettingsGroup group={groups[3]} delay="300ms" />

      {/* Sign out */}
      <section className="onyx-rise" style={{ animationDelay: "360ms" }}>
        <div className="onyx-panel overflow-hidden rounded-[22px] px-2.5 py-1">
          <button
            type="button"
            onClick={open("signout")}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-2 py-3.5 text-[14px] font-semibold text-danger transition-colors hover:bg-danger/[0.06]"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </section>

      {/* Sheets */}
      <ProfileSheet open={sheet === "profile"} onClose={close} />
      <PinSheet open={sheet === "pin"} onClose={close} />
      <NotificationPrefsSheet open={sheet === "notifs"} onClose={close} />
      <LimitsSheet open={sheet === "limits"} onClose={close} />
      <StatementsSheet open={sheet === "statements"} onClose={close} />
      <HelpSheet open={sheet === "help"} onClose={close} />
      <ContactSheet open={sheet === "contact"} onClose={close} />
      <TermsSheet open={sheet === "terms"} onClose={close} />
      <AppearanceSheet open={sheet === "appearance"} onClose={close} />
      <LanguageSheet open={sheet === "language"} onClose={close} />
      <ReferralSheet open={sheet === "referral"} onClose={close} />
      <SignOutSheet open={sheet === "signout"} onClose={close} />
    </div>
  );
}
