import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, RotateCw, Search, X } from "lucide-react";
import { NETWORKS, type Network, type NetworkId } from "@/data/bundles";
import { formatGHS } from "@/lib/format";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";
import { useFlows } from "@/store/flows";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";

/**
 * The shop floor: every live bundle, on the page itself.
 *
 * With no filter on, bundles are grouped by network in catalogue order — MTN
 * first — rather than interleaved by price, so a shopper who came for one
 * network never has to hunt. Each group shows its cheapest few; "see all"
 * simply switches the filter to that network.
 *
 * Tapping a card opens the existing BuyDataFlow already standing on the
 * recipient step. The flow, its pricing and payment paths are untouched.
 */

type Filter = "all" | NetworkId;
type LoadState = "loading" | "ready" | "error";

interface Row {
  id: string;
  /** app_product_code — what the order is actually placed against. */
  code: string;
  network: Network;
  size: string;
  validity: string | null;
  price: number;
  /** Lowercased and space-stripped so "5gb" matches "5 GB". */
  haystack: string;
}

/** How many of a network's bundles to show before "see all" takes over. */
const PER_GROUP = 6;

/** Same mapping the buy flow uses — the network lives in the product code. */
const CODE_PREFIX: Record<NetworkId, string> = { mtn: "mtn", telecel: "tel", at: "at" };

function networkForCode(code: string | null): Network | null {
  if (!code) return null;
  return NETWORKS.find((n) => code.startsWith(CODE_PREFIX[n.id])) ?? null;
}

/** Catalogue names read "MTN — 5GB"; the part after the dash is the headline. */
function toRow(product: Phase1Product): Row | null {
  const network = networkForCode(product.app_product_code);
  if (!network) return null;
  const size = product.name.replace(/^.*?—\s*/, "").trim() || product.name;
  return {
    id: product.id,
    code: product.app_product_code ?? product.id,
    network,
    size,
    validity: product.validity,
    price: Number(product.customer_price),
    haystack: `${size} ${network.name}`.toLowerCase().replace(/\s+/g, ""),
  };
}

/** The catalogue stores "Supplier terms" when the network decides the window
 *  itself. That is true of every row today, so it is said once under the grid
 *  rather than on every card. */
function statedValidity(validity: string | null): string | null {
  if (!validity || validity.toLowerCase() === "supplier terms") return null;
  return `Valid ${validity}`;
}

/* ── Card ────────────────────────────────────────────────────────── */

function BundleCard({ row, onBuy }: { row: Row; onBuy: () => void }) {
  const validity = statedValidity(row.validity);
  return (
    <button
      type="button"
      onClick={onBuy}
      className="mk-bundle group min-h-[126px] !p-4 sm:min-h-[136px] sm:!p-5"
      aria-label={`Buy ${row.network.name} ${row.size} for ${formatGHS(row.price)}`}
    >
      <span
        className="mk-cat-mark h-6 w-auto shrink-0 self-start rounded-full px-2.5 text-[10px] tracking-[0.09em]"
        style={{ "--brand": row.network.color } as CSSProperties}
      >
        {row.network.name.toUpperCase()}
      </span>

      <span
        className={cn(
          "mt-4 block break-words font-display font-semibold leading-[1.04] tracking-[-0.035em] text-foreground",
          row.size.length > 9 ? "text-[19px] sm:text-[21px]" : "text-[26px] sm:text-[30px]",
        )}
      >
        {row.size}
      </span>
      {validity && (
        <span className="mt-1.5 block text-[11.5px] leading-4 text-faint-foreground sm:text-[12.5px]">
          {validity}
        </span>
      )}

      <span className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.07] pt-3.5 sm:pt-4">
        <span className="tnum font-display text-[15px] font-semibold text-foreground sm:text-[17px]">
          {formatGHS(row.price)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-glow">
          <span className="hidden sm:inline">Buy</span>
          <ArrowRight size={15} className="mk-arrow" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

/* ── Grid ────────────────────────────────────────────────────────── */

const GRID = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4";

/** Its own component so the reveal observer attaches when the grid actually
 *  mounts — i.e. after the catalogue lands, not before it exists. The reveal
 *  sits on the container, never on individual cards: cards come and go with
 *  the filter, and a card that is never observed would stay invisible. */
function BundleGrid({ rows, onBuy }: { rows: Row[]; onBuy: (row: Row) => void }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-reveal className={GRID}>
      {rows.map((row) => (
        <BundleCard key={row.id} row={row} onBuy={() => onBuy(row)} />
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className={GRID} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="mk-bundle !p-4 sm:!p-5">
          <span className="mk-skeleton h-6 w-[58px] rounded-full" />
          <span className="mk-skeleton mt-4 h-7 w-[62%]" />
          <span className="mk-skeleton mt-2 h-3 w-[46%]" />
          <span className="mt-auto flex items-center justify-between border-t border-white/[0.07] pt-4">
            <span className="mk-skeleton h-4 w-[66px]" />
            <span className="mk-skeleton h-4 w-[26px]" />
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Section ─────────────────────────────────────────────────────── */

export default function BundleCatalogue() {
  const { openBuyData } = useFlows();
  const [products, setProducts] = useState<Phase1Product[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    setState("loading");
    void loadPhase1Products().then((result) => {
      if (!mounted) return;
      setProducts(result.data);
      setState(result.error || result.data.length === 0 ? "error" : "ready");
    });
    return () => {
      mounted = false;
    };
  }, [attempt]);

  const rows = useMemo(
    () => products.map(toRow).filter((row): row is Row => row !== null),
    [products],
  );

  const term = query.trim().toLowerCase().replace(/\s+/g, "");
  const matching = useMemo(
    () => rows.filter((row) => term === "" || row.haystack.includes(term)),
    [rows, term],
  );

  /** One bucket per network, each cheapest-first, in catalogue order. */
  const groups = useMemo(
    () =>
      NETWORKS.map((network) => ({
        network,
        rows: matching
          .filter((row) => row.network.id === network.id)
          .sort((a, b) => a.price - b.price),
      })).filter((group) => group.rows.length > 0),
    [matching],
  );

  const visibleGroups = filter === "all" ? groups : groups.filter((g) => g.network.id === filter);
  const total = visibleGroups.reduce((sum, g) => sum + g.rows.length, 0);

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([["all", rows.length]]);
    for (const network of NETWORKS) {
      map.set(network.id, rows.filter((row) => row.network.id === network.id).length);
    }
    return map;
  }, [rows]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    ...NETWORKS.map((n) => ({ id: n.id as Filter, label: n.name })),
  ];

  const buy = (row: Row) =>
    openBuyData({ kind: "bundle", networkId: row.network.id, productCode: row.code });

  return (
    <section aria-labelledby="catalogue-title" className="scroll-mt-24" id="bundles">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <h2
            id="catalogue-title"
            className="font-display text-[20px] font-semibold tracking-tight text-foreground sm:text-[24px]"
          >
            Choose a bundle
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-6 text-muted-foreground">
            Live prices straight from the catalogue. What you see is what you pay.
          </p>
        </div>

        {state === "ready" && (
          <label className="onyx-search flex w-full shrink-0 items-center gap-2.5 sm:w-[254px]">
            <Search size={16} className="shrink-0 text-faint-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 5GB, MTN…"
              aria-label="Search bundles"
              className="w-full min-w-0 bg-transparent text-[16px] tracking-tight text-foreground outline-none placeholder:text-faint-foreground sm:text-[14px]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="shrink-0 text-faint-foreground transition-colors hover:text-foreground"
              >
                <X size={15} />
              </button>
            )}
          </label>
        )}
      </div>

      {/* Filters */}
      {state === "ready" && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {filters.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={on}
                className={cn("onyx-pill", on && "onyx-pill-on")}
              >
                {f.label}
                <span className={cn("ml-1.5 tnum text-[11.5px]", on ? "opacity-60" : "opacity-45")}>
                  {counts.get(f.id) ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div className="mt-6">
        {state === "loading" && (
          <>
            <p className="sr-only" role="status">
              Loading live bundle prices.
            </p>
            <SkeletonGrid />
          </>
        )}

        {state === "error" && (
          <div className="mk-card flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="max-w-[52ch]">
              <h3 className="font-display text-[16px] font-semibold tracking-tight text-foreground">
                Bundles are not loading right now
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-6 text-muted-foreground">
                This is usually a brief network hiccup. Nothing has been charged — try again in a moment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="onyx-btn-ghost w-full shrink-0 sm:w-auto"
            >
              <RotateCw size={16} />
              Try again
            </button>
          </div>
        )}

        {state === "ready" && total === 0 && (
          <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] px-6 py-12 text-center">
            <p className="font-display text-[16px] font-semibold tracking-tight text-foreground">
              No bundle matches “{query.trim()}”
            </p>
            <p className="mx-auto mt-2 max-w-[42ch] text-[13.5px] leading-6 text-muted-foreground">
              Try the size on its own — 1GB, 5GB — or clear the search to see everything.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="onyx-btn-ghost mx-auto mt-6"
            >
              Show all bundles
            </button>
          </div>
        )}

        {state === "ready" && total > 0 && (
          <>
            <p className="sr-only" role="status">
              {total} bundle{total === 1 ? "" : "s"} available.
            </p>

            <div className="space-y-10 sm:space-y-12">
              {visibleGroups.map((group) => {
                // Whole network on screen when it is the one being filtered.
                const shown = filter === "all" ? group.rows.slice(0, PER_GROUP) : group.rows;
                const rest = group.rows.length - shown.length;

                return (
                  <div key={group.network.id}>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <h3 className="flex items-center gap-2.5">
                        <span
                          className="mk-cat-mark h-6 w-auto shrink-0 rounded-full px-2.5 text-[10px] tracking-[0.09em]"
                          style={{ "--brand": group.network.color } as CSSProperties}
                        >
                          {group.network.name.toUpperCase()}
                        </span>
                        <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                          {group.network.name} bundles
                        </span>
                        <span className="tnum text-[12.5px] text-faint-foreground">
                          {group.rows.length}
                        </span>
                      </h3>

                      {rest > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilter(group.network.id)}
                          className="group inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-primary-glow"
                        >
                          See all {group.rows.length}
                          <ArrowRight size={15} className="mk-arrow" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <BundleGrid rows={shown} onBuy={buy} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {state === "ready" && total > 0 && (
          <p className="mt-8 flex items-start gap-2.5 text-[12.5px] leading-5 text-faint-foreground">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-glow" aria-hidden="true" />
            Where no validity is shown, the network sets it when the bundle lands. Prices can change
            when the networks change theirs.
          </p>
        )}
      </div>
    </section>
  );
}
