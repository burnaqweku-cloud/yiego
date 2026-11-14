import { useState } from "react";
import { CreditCard, Gift } from "lucide-react";
import InviteSheet from "@/components/referrals/InviteSheet";
import Seo from "@/components/seo/Seo";
import AgentShopCard from "@/components/agents/AgentShopCard";
import { metaFor } from "@/lib/site";
import RecentActivity from "@/components/dashboard/RecentActivity";
import BundleCatalogue from "@/components/shop/BundleCatalogue";
import ShopBand from "@/components/shop/ShopBand";
import ImportantNotice from "@/components/shop/ImportantNotice";
import { TRUST_POINTS } from "@/data/marketing";
import { useDeliverySpeed } from "@/hooks/useDeliverySpeed";
import { useReveal } from "@/hooks/useReveal";
import { useAuth } from "@/store/auth-context";
import { useFlows } from "@/store/flows";
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

export default function Shop() {
  const [inviteOpen, setInviteOpen] = useState(false);
  // The network tab open in the catalogue, so the wallet card shows that network's latest delivery.
  const [network, setNetwork] = useState("MTN");
  const speeds = useDeliverySpeed();
  const ref = useReveal<HTMLDivElement>();
  const { isAuthenticated } = useAuth();
  const { transactions } = useWallet();
  const { openBuyData } = useFlows();

  return (
    <div ref={ref} className="space-y-6 lg:space-y-10">
      <Seo {...metaFor("/shop")} />
      {/* ── One band: the wallet when signed in, the page's name when not, the latest delivery either way ── */}
      <ShopBand network={network} speed={speeds[network]} />

      {isAuthenticated && (
        <>
          <div className="yg-quick">
            <button type="button" onClick={() => openBuyData({ kind: "payOrder" })}>
              <CreditCard aria-hidden="true" />
              <span>Pay for an order<small>Someone shared an Order ID</small></span>
            </button>
            <button type="button" onClick={() => setInviteOpen(true)}>
              <Gift aria-hidden="true" />
              <span>Invite &amp; earn<small>GHS 6.00 in data</small></span>
            </button>
          </div>
          <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />

          <AgentShopCard />
        </>
      )}

      {/* ── The catalogue ───────────────────────────────────────── */}
      <BundleCatalogue onNetwork={setNetwork} />

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
