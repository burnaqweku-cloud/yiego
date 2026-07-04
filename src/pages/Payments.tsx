import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Code2,
  Copy,
  FileText,
  KeyRound,
  LayoutPanelTop,
  Link2,
  Plus,
  type LucideIcon,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import SectionHeader from "@/components/ui/section-header";
import StatTile from "@/components/ui/stat-tile";
import ListRow from "@/components/ui/list-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatGHS } from "@/lib/format";
import { comingSoonToast } from "@/lib/toasts";
import { cn } from "@/lib/utils";

/* ── Sample data (mock — swap for backend later) ───────────────── */

type LinkStatus = "Active" | "Paid";

const PAYMENT_LINKS: {
  title: string;
  slug: string;
  paid: number;
  amount: number;
  status: LinkStatus;
}[] = [
  { title: "Design retainer", slug: "dz4k", paid: 3, amount: 2500, status: "Active" },
  { title: "Event ticket — VIP", slug: "vip7", paid: 41, amount: 150, status: "Active" },
  { title: "1:1 Consultation", slug: "cnsl", paid: 12, amount: 400, status: "Active" },
  { title: "Monthly subscription", slug: "subm", paid: 28, amount: 60, status: "Active" },
  { title: "Donation", slug: "give", paid: 64, amount: 500, status: "Paid" },
];

const WAYS: { title: string; icon: LucideIcon; desc: string }[] = [
  { title: "Payment Links", icon: Link2, desc: "Share a link, get paid — no code or store needed." },
  { title: "Checkout Pages", icon: LayoutPanelTop, desc: "A hosted, branded page for products and events." },
  { title: "Invoices", icon: FileText, desc: "Send professional invoices and track what's owed." },
  { title: "Developer API", icon: Code2, desc: "Wire cedis into your app with a clean REST API." },
];

const SNIPPET = `curl https://api.yiego.com/v1/links \\
  -H "Authorization: Bearer sk_live_••••" \\
  -d amount=15000 \\
  -d currency=GHS \\
  -d title="Design retainer"`;

/* ── Small inline building blocks ──────────────────────────────── */

/** ~40px emerald chip echoing the .onyx-tx-icon.is-in style. */
function LinkChip() {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary-glow/20 bg-primary/12 text-primary-glow">
      <Link2 size={17} />
    </span>
  );
}

function StatusBadge({ status }: { status: LinkStatus }) {
  const active = status === "Active";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
        active ? "bg-primary/12 text-primary-glow" : "bg-white/[0.06] text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

/** Whole-card button — one of the four "Ways to get paid". */
function WayCard({ title, icon: Icon, desc }: { title: string; icon: LucideIcon; desc: string }) {
  return (
    <button
      type="button"
      onClick={() => comingSoonToast(title)}
      className="onyx-panel rounded-[20px] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-glow/25"
    >
      <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-primary-glow/20 bg-gradient-to-b from-primary/[0.16] to-primary/[0.04] text-primary-glow">
        <Icon size={18} />
      </span>
      <h3 className="mt-3.5 font-display text-[15px] font-semibold tracking-tight text-white">
        {title}
      </h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary-glow">
        Set up
        <ArrowUpRight size={14} strokeWidth={2.4} />
      </span>
    </button>
  );
}

/** Developer trust card — terminal + live secret key + docs link. */
function DevelopersCard() {
  const [copied, setCopied] = useState(false);

  const copySnippet = () => {
    navigator.clipboard?.writeText(SNIPPET).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="onyx-dev relative overflow-hidden rounded-[26px] p-6 sm:p-7">
      <span className="onyx-dev-glow" aria-hidden="true" />

      <div className="relative flex items-center gap-2 text-primary-glow">
        <Code2 size={16} />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.18em]">
          For developers
        </span>
      </div>

      <h3 className="relative mt-3 max-w-[24ch] font-display text-[22px] font-semibold leading-[1.08] tracking-[-0.02em] text-white sm:text-[25px]">
        Accept cedis in your app in one call.
      </h3>
      <p className="relative mt-2.5 max-w-[46ch] text-[13.5px] leading-relaxed text-muted-foreground">
        Payment links, checkout pages and payouts — the same rails powering your wallet, exposed as
        a clean REST API.
      </p>

      <div className="onyx-terminal relative mt-5">
        <div className="onyx-terminal-bar">
          <span className="onyx-dot" style={{ background: "#F5655B" }} />
          <span className="onyx-dot" style={{ background: "#F5B544" }} />
          <span className="onyx-dot" style={{ background: "#3FDD9A" }} />
          <span className="ml-2 font-mono text-[11px] text-[#6e8b7d]">create-link.sh</span>
          <button
            type="button"
            onClick={copySnippet}
            className="onyx-copy ml-auto"
            aria-label="Copy code snippet"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="onyx-code">
          <code>
            <span className="text-[#5c7a6c]">$ </span>
            <span className="text-primary-glow">curl</span>{" "}
            <span className="text-[#b7c6be]">https://api.yiego.com/v1/links</span> \{"\n"}
            {"  "}-H <span className="text-[#e7c4a0]">"Authorization: Bearer sk_live_••••"</span> \
            {"\n"}
            {"  "}-d amount=<span className="text-amber">15000</span> \{"\n"}
            {"  "}-d currency=<span className="text-amber">GHS</span> \{"\n"}
            {"  "}-d title=<span className="text-[#e7c4a0]">"Design retainer"</span>
          </code>
        </pre>
      </div>

      <div className="relative mt-5 rounded-[18px] border border-white/[0.06] bg-white/[0.02] px-1.5 py-1">
        <ListRow
          icon={
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary-glow/20 bg-primary/12 text-primary-glow">
              <KeyRound size={17} />
            </span>
          }
          title="Live secret key"
          subtitle={<span className="font-mono tracking-tight">sk_live_••••••••4f2a</span>}
          right={
            <button
              type="button"
              onClick={() => comingSoonToast("Copy secret key")}
              className="onyx-copy"
              aria-label="Copy live secret key"
            >
              <Copy size={13} />
              Copy
            </button>
          }
        />
      </div>

      <div className="relative mt-4">
        <button
          type="button"
          onClick={() => comingSoonToast("API docs")}
          className="onyx-ghostlink"
        >
          View API docs
          <ArrowUpRight size={15} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function Payments() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="Business"
        title="Payments"
        subtitle="Accept money like a pro — payment links, checkout pages and a clean API, on the same rails as your wallet."
        action={
          <Button onClick={() => comingSoonToast("Create payment link")}>
            <Plus size={16} strokeWidth={2.4} />
            Create payment link
          </Button>
        }
      />

      {/* Snapshot */}
      <section
        className="onyx-rise grid grid-cols-2 gap-3 lg:grid-cols-4"
        style={{ animationDelay: "60ms" }}
      >
        <StatTile label="Collected · 30d" value={formatGHS(8420)} delta="+18.4%" />
        <StatTile label="Payment links" value="12" delta="3 active" tone="muted" />
        <StatTile label="Success rate" value="98.2%" />
        <StatTile label="Payouts · 30d" value={formatGHS(6900)} delta="settled" tone="muted" />
      </section>

      {/* Payment links */}
      <section className="onyx-rise space-y-3" style={{ animationDelay: "120ms" }}>
        <SectionHeader
          title="Your payment links"
          action={
            <Button
              variant="soft"
              size="sm"
              onClick={() => comingSoonToast("New payment link")}
            >
              <Plus size={15} strokeWidth={2.4} />
              New link
            </Button>
          }
        />
        <Card className="px-2 py-1.5 sm:px-3 sm:py-2">
          <div className="divide-y divide-white/5">
            {PAYMENT_LINKS.map((link) => (
              <ListRow
                key={link.slug}
                icon={<LinkChip />}
                title={link.title}
                subtitle={`link.yiego.com/${link.slug} · ${link.paid} paid`}
                onClick={() => comingSoonToast(link.title)}
                right={
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-display text-[13.5px] font-semibold tnum text-white">
                      {formatGHS(link.amount)}
                    </span>
                    <StatusBadge status={link.status} />
                  </div>
                }
              />
            ))}
          </div>
        </Card>
      </section>

      {/* Ways to get paid */}
      <section className="onyx-rise space-y-3" style={{ animationDelay: "180ms" }}>
        <SectionHeader title="Ways to get paid" />
        <div className="grid gap-3 sm:grid-cols-2">
          {WAYS.map((w) => (
            <WayCard key={w.title} title={w.title} icon={w.icon} desc={w.desc} />
          ))}
        </div>
      </section>

      {/* Developers */}
      <section className="onyx-rise space-y-3" style={{ animationDelay: "240ms" }}>
        <SectionHeader title="Developers" />
        <DevelopersCard />
      </section>
    </div>
  );
}
