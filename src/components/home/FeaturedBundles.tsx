import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { NETWORKS, type Network, type NetworkId } from "@/data/bundles";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";
import { formatGHS } from "@/lib/format";

/**
 * Featured bundles — real rows from the live phase1 catalogue, not a
 * hand-written price list. If the catalogue is slow or empty the section
 * degrades to a calm pointer at the shop rather than an error.
 */

type LoadState = "loading" | "ready" | "unavailable";

interface BundleCard {
  key: string;
  network: Network;
  size: string;
  validity: string | null;
  price: number;
}

/** Two per network keeps the grid at a clean 6 across all three carriers. */
const PER_NETWORK = 2;

/* Mobile is a bleed-to-edge snap rail; sm and up becomes a grid. The negative
   inline margin exactly cancels .mk-wrap's padding, so the page itself never
   gains a horizontal scrollbar — only this rail scrolls. */
const RAIL =
  "-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-2 no-scrollbar" +
  " sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 lg:gap-6";

const CARD = "min-h-[206px] w-[72vw] max-w-[280px] shrink-0 snap-start sm:w-auto sm:max-w-none";

/** Same derivation the buy flow uses — network lives in the product code. */
function codePrefix(id: NetworkId): string {
  return id === "mtn" ? "mtn" : id === "telecel" ? "tel" : "at";
}

/** Catalogue names read "MTN — 5GB"; the part after the dash is the headline. */
function bundleSize(product: Phase1Product): string {
  return product.name.replace(/^.*?—\s*/, "").trim() || product.name;
}

/**
 * A low-to-mid spread rather than the cheapest rows: skip the token starter
 * bundle, then step through the sorted list with a bias towards the prices
 * people actually buy.
 */
function pickSpread(list: Phase1Product[], count: number): Phase1Product[] {
  const sorted = [...list].sort((a, b) => Number(a.customer_price) - Number(b.customer_price));
  if (sorted.length <= count) return sorted;

  const pool = sorted.length > count + 1 ? sorted.slice(1) : sorted;
  const step = count > 1 ? (pool.length - 1) / (count - 1) : 0;
  const picked: Phase1Product[] = [];

  for (let i = 0; i < count; i += 1) {
    let index = Math.min(pool.length - 1, Math.round(i * step * 0.55));
    while (index < pool.length - 1 && picked.includes(pool[index])) index += 1;
    const product = pool[index];
    if (product && !picked.includes(product)) picked.push(product);
  }

  return picked;
}

function validityLine(validity: string | null): string {
  if (!validity || validity.toLowerCase() === "supplier terms") return "Validity set by the network";
  return `Valid ${validity}`;
}

/* ── States ──────────────────────────────────────────────────────── */

function SkeletonRail() {
  return (
    <div className={RAIL} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`mk-bundle ${CARD}`}>
          <span className="mk-skeleton h-7 w-[64px] rounded-full" />
          <span className="mk-skeleton mt-5 h-8 w-[62%]" />
          <span className="mk-skeleton mt-3 h-3 w-[44%]" />
          <div className="mt-auto flex items-center justify-between border-t border-white/[0.07] pt-4">
            <span className="mk-skeleton h-4 w-[70px]" />
            <span className="mk-skeleton h-4 w-[42px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Unavailable() {
  return (
    <div className="mk-card flex flex-col items-start gap-5 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div className="max-w-[52ch]">
        <h3 className="mk-h3">Live bundle prices are loading slowly right now.</h3>
        <p className="mk-body mt-2">
          The full catalogue is always in the shop — every network, every bundle, at today&rsquo;s price.
        </p>
      </div>
      <Link to="/shop" className="mk-btn mk-btn-primary group w-full shrink-0 sm:w-auto">
        Go to the shop
        <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
      </Link>
    </div>
  );
}

function BundleRail({ cards }: { cards: BundleCard[] }) {
  // Mounted only once the catalogue lands, so its own observer picks up the
  // rail that did not exist when the section first rendered.
  const ref = useReveal<HTMLDivElement>();

  return (
    // The reveal lives on the rail, not on each card: below `sm` the rail
    // clips horizontally, so off-screen cards would never intersect the
    // viewport and would sit at opacity 0 until the user happened to swipe.
    <div ref={ref} data-reveal className={RAIL}>
      {cards.map((card) => (
        <Link
          key={card.key}
          to="/shop"
          className={`mk-bundle group ${CARD}`}
          aria-label={`Buy the ${card.network.name} ${card.size} bundle for ${formatGHS(card.price)}`}
        >
          <span
            className="mk-cat-mark h-7 w-auto shrink-0 self-start rounded-full px-2.5 text-[10.5px] tracking-[0.09em]"
            style={{ "--brand": card.network.color } as CSSProperties}
          >
            {card.network.name.toUpperCase()}
          </span>

          <p
            className={`mt-5 break-words font-display font-semibold leading-[1.04] tracking-[-0.035em] text-foreground ${
              card.size.length > 9 ? "text-[22px]" : "text-[32px] sm:text-[34px]"
            }`}
          >
            {card.size}
          </p>
          <p className="mt-2 text-[12.5px] text-faint-foreground">{validityLine(card.validity)}</p>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
            <span className="tnum font-display text-[17px] font-semibold text-foreground">
              {formatGHS(card.price)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-glow">
              Buy
              <ArrowRight size={15} className="mk-arrow" aria-hidden="true" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ── Section ─────────────────────────────────────────────────────── */

export default function FeaturedBundles() {
  const ref = useReveal<HTMLElement>();
  const [products, setProducts] = useState<Phase1Product[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let mounted = true;
    void loadPhase1Products().then((result) => {
      if (!mounted) return;
      setProducts(result.data);
      setState(result.error || result.data.length === 0 ? "unavailable" : "ready");
    });
    return () => {
      mounted = false;
    };
  }, []);

  const cards = useMemo<BundleCard[]>(
    () =>
      NETWORKS.flatMap((network) => {
        const prefix = codePrefix(network.id);
        const matches = products.filter((product) => product.app_product_code?.startsWith(prefix));
        return pickSpread(matches, PER_NETWORK).map((product) => ({
          key: product.id,
          network,
          size: bundleSize(product),
          validity: product.validity,
          price: Number(product.customer_price),
        }));
      }).sort((a, b) => a.price - b.price),
    [products],
  );

  const hasCards = state === "ready" && cards.length > 0;

  return (
    <section ref={ref} className="mk-section" aria-labelledby="bundles-h">
      <div className="mk-wrap">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <div className="max-w-[560px]" data-reveal>
            <span className="mk-eyebrow">Popular right now</span>
            <h2 id="bundles-h" className="mk-h2 mt-4">
              The bundles people <span className="mk-accent">actually buy</span>
            </h2>
            <p className="mk-lead mt-4 max-w-[46ch]">
              A slice of today&rsquo;s catalogue across all three networks. The price on the card is the
              price at checkout — nothing gets added at the end.
            </p>
          </div>

          <Link
            to="/shop"
            className="group hidden shrink-0 items-center gap-2 pb-1.5 text-[14px] font-semibold text-primary-glow sm:inline-flex"
            data-reveal
            style={{ "--d": "80ms" } as CSSProperties}
          >
            See all bundles
            <ArrowRight size={16} className="mk-arrow" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-10 sm:mt-12">
          {state === "loading" && (
            <>
              <p className="sr-only" role="status">
                Loading live bundle prices.
              </p>
              <SkeletonRail />
            </>
          )}
          {state !== "loading" && !hasCards && <Unavailable />}
          {hasCards && <BundleRail cards={cards} />}
        </div>

        {hasCards && (
          <p className="mt-6 flex items-center gap-2.5 text-[12.5px] leading-5 text-faint-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-glow" aria-hidden="true" />
            Pulled live from the DataYego catalogue. Prices can change when the networks change theirs.
          </p>
        )}

        {hasCards && (
          <Link to="/shop" className="mk-btn mk-btn-ghost group mt-7 w-full sm:hidden">
            See all bundles
            <ArrowRight size={17} className="mk-arrow" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
