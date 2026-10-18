import { useState } from "react";
import { ArrowRight, CreditCard, Gift } from "lucide-react";
import InviteSheet from "@/components/referrals/InviteSheet";
import Seo from "@/components/seo/Seo";
import AgentShopCard from "@/components/agents/AgentShopCard";
import { metaFor } from "@/lib/site";
import BalanceCard from "@/components/dashboard/BalanceCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import BundleCatalogue from "@/components/shop/BundleCatalogue";
import ImportantNotice from "@/components/shop/ImportantNotice";
import { TRUST_POINTS } from "@/data/marketing";
import { useReveal } from "@/hooks/useReveal";
import { useAuth } from "@/store/auth-context";
import { useFlows } from "@/store/flows";
import { useProfile } from "@/store/profile";
import { useWallet } from "@/store/wallet";

/**
 * The shop. The catalogue is the page — a shopper sees real bundles and real
 * prices immediately, and the existing buy flow opens on the recipient step
 * with their choice already made.
 *
 * Only elements that mount with the page carry `data-reveal`; anything that
 * appears after a fetch (the wallet, recent activity) renders plainly, since
 * the shared observer only sweeps for targets once.
 */

const dateFmt = new Intl.DateTimeFormat("en-GH", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Shop() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const ref = useReveal<HTMLDivElement>();
  const { profile } = useProfile();
  const { isAuthenticated } = useAuth();
  const { transactions } = useWallet();
  const { openBuyData } = useFlows();

  return (
    <div ref={ref} className="space-y-6 lg:space-y-10">
      <Seo {...metaFor("/shop")} />
      {isAuthenticated ? (
        <>
          {/* Signed in: a slim greeting, then the wallet as the hero — the
              first thing a returning customer sees, the way a bank app leads
              with your balance rather than burying it under copy. */}
          <header data-reveal>
            <p className="text-[13.5px] font-semibold text-muted-foreground">
              {dateFmt.format(new Date())}
            </p>
            <h1 className="mt-1.5 font-display text-[24px] font-semibold tracking-tight text-foreground sm:text-[30px]">
              {greeting()}, {profile.firstName}
            </h1>
          </header>

          {/* ── Wallet, at the forefront ──────────────────────────── */}
          <BalanceCard />

          {/* Secondary action: settle an Order ID someone shared with you. */}
          <button
            type="button"
            onClick={() => openBuyData({ kind: "payOrder" })}
            className="group inline-flex items-center gap-2 text-[13.5px] font-semibold text-primary-glow"
          >
            <CreditCard size={15} aria-hidden="true" />
            Pay for someone&rsquo;s order
            <ArrowRight size={15} className="mk-arrow" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="group inline-flex items-center gap-2 text-[13.5px] font-semibold text-primary-glow"
          >
            <Gift size={15} aria-hidden="true" />
            Invite &amp; earn GHS 6.00 in data
            <ArrowRight size={15} className="mk-arrow" aria-hidden="true" />
          </button>
          <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />

          <AgentShopCard />
        </>
      ) : (
        <header data-reveal>
          <h1 className="font-display text-[26px] font-semibold tracking-tight text-foreground sm:text-[32px]">
            Buy Ghana data online
          </h1>
          <p className="mt-1.5 max-w-[62ch] text-[14px] leading-6 text-muted-foreground">
            Tap a bundle, enter the number, pay with MoMo or card. No account needed.
          </p>
        </header>
      )}

      {/* ── The catalogue ───────────────────────────────────────── */}
      <BundleCatalogue />

      {/* ── The house rules, before anyone pays ───────────────── */}
      <ImportantNotice />

      {/* ── What every order comes with ─────────────────────────── */}
      <section aria-labelledby="shop-trust-h">
        <h2 id="shop-trust-h" className="sr-only">
          What every DataYego order comes with
        </h2>
        <ul className="mk-trust" data-reveal>
          {TRUST_POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <li key={point.label} className="flex items-start gap-3">
                <Icon
                  size={17}
                  strokeWidth={1.8}
                  className="mt-[3px] shrink-0 text-faint-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold tracking-tight text-foreground">
                    {point.label}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-faint-foreground">
                    {point.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Empty until there is something to show — an activity panel with no
          activity reads as a broken page on a brand-new account. */}
      {isAuthenticated && transactions.length > 0 && (
        <section>
          <RecentActivity />
        </section>
      )}
    </div>
  );
}
