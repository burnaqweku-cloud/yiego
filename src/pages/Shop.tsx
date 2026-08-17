import { ArrowRight, CreditCard } from "lucide-react";
import Seo from "@/components/seo/Seo";
import { metaFor } from "@/lib/site";
import BalanceCard from "@/components/dashboard/BalanceCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import BundleCatalogue from "@/components/shop/BundleCatalogue";
import DeliveryNotice from "@/components/shop/DeliveryNotice";
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
  const ref = useReveal<HTMLDivElement>();
  const { profile } = useProfile();
  const { isAuthenticated } = useAuth();
  const { transactions } = useWallet();
  const { openBuyData } = useFlows();

  return (
    <div ref={ref} className="space-y-8 lg:space-y-11">
      <Seo {...metaFor("/shop")} />
      {isAuthenticated ? (
        <>
          {/* Signed in: a slim greeting, then the wallet as the hero — the
              first thing a returning customer sees, the way a bank app leads
              with your balance rather than burying it under copy. */}
          <header data-reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
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
        </>
      ) : (
        <header data-reveal>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
            Data bundles
          </p>
          <h1 className="mt-1.5 font-display text-[24px] font-semibold tracking-tight text-foreground sm:text-[30px]">
            Buy Ghana data in minutes
          </h1>
          <p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted-foreground">
            Pick a bundle below, enter the recipient number and pay. Delivery starts the moment payment
            clears — to your own number or anyone else&rsquo;s.
          </p>
        </header>
      )}

      <DeliveryNotice className="mb-5" />

      {/* ── The catalogue ───────────────────────────────────────── */}
      <BundleCatalogue />

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
