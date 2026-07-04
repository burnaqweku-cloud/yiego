import PageHeader from "@/components/layout/PageHeader";
import ListRow from "@/components/ui/list-row";
import { Button } from "@/components/ui/button";
import { MOCK_USER } from "@/data/mock";
import { comingSoonToast } from "@/lib/toasts";
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
  type LucideIcon,
} from "lucide-react";

/* ── Inline settings data (swap for backend later) ─────────────── */
const CONTACT_LINE = "kwame@yiego.com · 024 ••• 221";
const DAILY_LIMIT = "GH₵ 50,000";

interface SettingItem {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  value?: string;
}

interface SettingGroup {
  label: string;
  items: SettingItem[];
}

const GROUPS: SettingGroup[] = [
  {
    label: "Personal",
    items: [
      { icon: User, title: "Personal details" },
      { icon: Lock, title: "Security & PIN" },
      { icon: Bell, title: "Notifications" },
    ],
  },
  {
    label: "Money",
    items: [
      { icon: Banknote, title: "Payout methods" },
      { icon: ShieldCheck, title: "Limits & verification", subtitle: "Tier 2" },
      { icon: FileText, title: "Statements" },
    ],
  },
  {
    label: "Preferences",
    items: [
      { icon: Moon, title: "Appearance", value: "Dark" },
      { icon: Globe, title: "Language", value: "English" },
    ],
  },
  {
    label: "Support",
    items: [
      { icon: LifeBuoy, title: "Help center" },
      { icon: MessageSquare, title: "Contact support" },
      { icon: FileText, title: "Terms & Privacy" },
    ],
  },
];

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
      <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint-foreground">
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
            onClick={() => comingSoonToast(item.title)}
          />
        ))}
      </div>
    </section>
  );
}

export default function Account() {
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
            className="onyx-avatar h-16 w-16 shrink-0 text-[20px]"
            aria-hidden="true"
          >
            {MOCK_USER.initials}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg font-semibold tracking-tight text-white">
              {MOCK_USER.firstName} {MOCK_USER.lastName}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{CONTACT_LINE}</p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => comingSoonToast("Edit profile")}
            className="h-11 shrink-0"
          >
            <Pencil size={15} />
            Edit
          </Button>
        </div>

        {/* Status chips */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {MOCK_USER.verified && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-glow/20 bg-primary/12 px-3 py-1 text-[12px] font-semibold text-primary-glow">
              <ShieldCheck size={13} />
              Verified · Tier 2
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] font-medium text-muted-foreground">
            <Gauge size={13} className="text-faint-foreground" />
            Daily limit · <span className="tnum text-foreground">{DAILY_LIMIT}</span>
          </span>
        </div>
      </div>

      {/* Settings groups */}
      <SettingsGroup group={GROUPS[0]} delay="120ms" />
      <SettingsGroup group={GROUPS[1]} delay="180ms" />
      <SettingsGroup group={GROUPS[2]} delay="240ms" />
      <SettingsGroup group={GROUPS[3]} delay="300ms" />

      {/* Sign out */}
      <section className="onyx-rise" style={{ animationDelay: "360ms" }}>
        <div className="onyx-panel overflow-hidden rounded-[22px] px-2.5 py-1">
          <button
            type="button"
            onClick={() => comingSoonToast("Sign out")}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-2 py-3.5 text-[14px] font-semibold text-danger transition-colors hover:bg-danger/[0.06]"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}
