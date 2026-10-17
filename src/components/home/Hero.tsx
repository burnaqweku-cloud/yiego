import { useState } from "react";
import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import InviteSheet from "@/components/referrals/InviteSheet";
import PriceBoard from "@/components/home/PriceBoard";

/**
 * The first screen: the promise on the left, the proof on the right. The
 * price board is the product — a visitor can buy from the hero without
 * reading anything else.
 */
function Actions({ onInvite }: { onInvite: () => void }) {
  return (
    <>
      <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-9">
        <Link to="/shop" className="mk-btn mk-btn-primary w-full sm:w-auto">
          Buy data
        </Link>
        <Link to="/track-order" className="mk-btn mk-btn-ghost w-full sm:w-auto">
          Track an order
        </Link>
      </div>

      <p className="mt-6 text-[13.5px] text-faint-foreground">
        No account needed. Buy as a guest and still track the order.
      </p>

      <button
        type="button"
        onClick={onInvite}
        className="mt-5 inline-flex items-center gap-2 text-[14px] font-semibold text-primary-glow underline-offset-4 hover:underline"
      >
        <Gift size={15} aria-hidden="true" />
        Invite a friend and earn GH₵6.00 in data
      </button>
    </>
  );
}

export default function Hero() {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <section className="mk-hero !pt-0" aria-labelledby="hero-h">
      <div className="mk-wrap">
        <div className="grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-12 lg:gap-10 lg:py-20">
          <div className="lg:col-span-6">
            <h1 id="hero-h" className="mk-hero-title max-w-[12ch]">
              Buy data for any Ghana number.
            </h1>
            <p className="mk-lead mt-7">
              MTN, Telecel and AirtelTigo bundles at prices that make sense. Pay with Mobile Money or card.
              Every order has a reference you can track.
            </p>

            {/* On phones the board comes straight after the headline; the buttons follow it. */}
            <div className="hidden lg:block">
              <Actions onInvite={() => setInviteOpen(true)} />
            </div>
          </div>

          <div className="lg:col-span-6">
            <PriceBoard />
          </div>

          <div className="-mt-4 lg:hidden">
            <Actions onInvite={() => setInviteOpen(true)} />
          </div>
          <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
        </div>
      </div>
    </section>
  );
}
