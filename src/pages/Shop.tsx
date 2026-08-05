import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bot, CreditCard, Search, UserPlus } from "lucide-react";
import BalanceCard from "@/components/dashboard/BalanceCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import BundleCatalogue from "@/components/shop/BundleCatalogue";
import { TRUST_POINTS } from "@/data/marketing";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth-context";
import { useFlows } from "@/store/flows";
import { useProfile } from "@/store/profile";
import { useWallet } from "@/store/wallet";

/**
 * The shop. The catalogue is on the page itself — a shopper sees real bundles
 * and real prices before anything is asked of them, and the existing buy flow
 * opens on the recipient step with their choice already made.
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

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** Small utility card — the two things people do here that are not buying. */
function UtilityCard({
  icon: Icon,
  title,
  body,
  action,
  onClick,
  to,
  className,
}: {
  icon: typeof Search;
  title: string;
  body: string;
  action: string;
  onClick?: () => void;
  to?: string;
  className?: string;
}) {
  const inner = (
    <>
      <span className="onyx-tile-icon">
        <Icon size={19} />
      </span>
      <h2 className="mt-4 font-display text-[16px] font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{body}</p>
      <span className="onyx-ghostlink mt-auto pt-4">
        {action}
        <ArrowRight size={15} className="mk-arrow" aria-hidden="true" />
      </span>
    </>
  );

  const shell = cn("onyx-panel group flex flex-col rounded-[22px] p-5 text-left", className);
  return to ? (
    <Link to={to} className={shell}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={shell}>
      {inner}
    </button>
  );
}

export default function Shop() {
  const ref = useReveal<HTMLDivElement>();
  const { profile } = useProfile();
  const { isAuthenticated } = useAuth();
  const { transactions } = useWallet();
  const { openBuyData } = useFlows();

  return (
    <div ref={ref} className="space-y-8 lg:space-y-11">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header data-reveal>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
          {isAuthenticated ? dateFmt.format(new Date()) : "Data bundles"}
        </p>
        <h1 className="mt-1.5 font-display text-[24px] font-semibold tracking-tight text-foreground sm:text-[30px]">
          {isAuthenticated ? `${greeting()}, ${profile.firstName}` : "Buy Ghana data in minutes"}
        </h1>
        <p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted-foreground">
          Pick a bundle below, enter the recipient number and pay. Delivery starts the moment payment
          clears — to your own number or anyone else&rsquo;s.
        </p>
      </header>

      {/* ── Wallet + utilities ──────────────────────────────────── */}
      {isAuthenticated ? (
        <div className="grid gap-4 lg:grid-cols-[1.32fr_0.68fr]">
          <BalanceCard />
          <div className="grid gap-4 min-[480px]:grid-cols-2 lg:grid-cols-1">
            <UtilityCard
              icon={Search}
              title="Track an order"
              body="Check payment and delivery with a YG- reference."
              action="Track now"
              to="/track-order"
            />
            <UtilityCard
              icon={CreditCard}
              title="Pay for an order"
              body="Someone sent you an Order ID to settle."
              action="Enter Order ID"
              onClick={() => openBuyData({ kind: "payOrder" })}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 min-[480px]:grid-cols-2 md:grid-cols-3">
          <UtilityCard
            icon={Search}
            title="Track an order"
            body="Check payment and delivery with a YG- reference. No account needed."
            action="Track now"
            to="/track-order"
          />
          <UtilityCard
            icon={UserPlus}
            title="Create an account"
            body="Pay from a wallet in two taps and keep every receipt in one place."
            action="Get started"
            to="/auth?mode=signup"
          />
          <UtilityCard
            icon={Bot}
            title="Ask YieGo AI"
            body="Questions about bundles, payment or delivery — answered any hour."
            action="Open the assistant"
            to="/support/ai"
            // Two-up on small tablets would leave this one stranded in a half row.
            className="min-[480px]:col-span-2 md:col-span-1"
          />
        </div>
      )}

      {/* ── The catalogue ───────────────────────────────────────── */}
      <BundleCatalogue />

      {/* ── What every order comes with ─────────────────────────── */}
      <section aria-labelledby="shop-trust-h">
        <h2 id="shop-trust-h" className="sr-only">
          What every YieGo order comes with
        </h2>
        <ul className="mk-trust" data-reveal style={delay(60)}>
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
