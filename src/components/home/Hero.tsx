import { useState } from "react";
import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import InviteSheet from "@/components/referrals/InviteSheet";
import { AgentNudgeLine } from "@/components/agents/AgentPopup";
import PriceBoard from "@/components/home/PriceBoard";

/**
 * The first screen: the promise on the left, the proof on the right. The
 * price board is the product — a visitor can buy from the hero without
 * reading anything else.
 */
/** The two actions. On phones they sit in one short row under the intro; on desktop they keep their full size. */
function Buttons({ compact = false }: { compact?: boolean }) {
  const size = compact ? "!min-h-[44px] !px-4 !text-[14.5px]" : "w-full sm:w-auto";
  return (
    <div className={compact ? "grid grid-cols-2 gap-2.5" : "mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"}>
      <Link to="/shop" className={`mk-btn mk-btn-primary ${size}`}>
        Buy data
      </Link>
      <Link to="/track-order" className={`mk-btn mk-btn-ghost ${size}`}>
        Track an order
      </Link>
    </div>
  );
}

function Notes({ onInvite }: { onInvite: () => void }) {
  return (
    <>
      <p className="mt-6 text-[13.5px] text-faint-foreground">
        No account needed. Buy as a guest and still track the order.
      </p>

      <button
        type="button"
        onClick={onInvite}
        className="mt-4 inline-flex items-center gap-2 text-[14px] font-semibold text-primary-glow underline-offset-4 hover:underline"
      >
        <Gift size={15} aria-hidden="true" />
        Invite &amp; earn GHS 6.00 in data
      </button>
    </>
  );
}

export default function Hero() {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <section className="mk-hero !pt-0" aria-labelledby="hero-h">
      <div className="mk-wrap">
        <div className="grid gap-6 py-8 sm:py-14 lg:grid-cols-12 lg:items-start lg:gap-10 lg:py-16">
          <div className="lg:col-span-6">
            <h1 id="hero-h" className="mk-hero-title max-w-[12ch]">
              Buy data for any Ghana number.
            </h1>
            <p className="mk-lead mt-5 lg:mt-7">
              MTN, Telecel and AirtelTigo bundles for any number. Pay with Mobile Money or card.
            </p>

            {/* Phones: a short row of the two actions, one line of small links, then the board. Desktop: full-size buttons. */}
            <div className="mt-5 lg:hidden">
              <Buttons compact />
              <div className="mt-3 flex flex-col items-start gap-1.5">
                <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-2 text-[13px] font-semibold text-primary-glow underline-offset-4 hover:underline">
                  <Gift size={14} aria-hidden="true" />
                  Invite &amp; earn GHS 6.00 in data
                </button>
                <AgentNudgeLine />
              </div>
            </div>
            <div className="hidden lg:block">
              <Buttons />
              <Notes onInvite={() => setInviteOpen(true)} />
            </div>
          </div>

          <div className="lg:col-span-6">
            <PriceBoard />
          </div>

          <p className="-mt-2 text-[12.5px] text-faint-foreground lg:hidden">No account needed. Buy as a guest and still track the order.</p>
          <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
        </div>
      </div>
    </section>
  );
}
