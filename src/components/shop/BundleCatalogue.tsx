import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { RotateCw, Search, X } from "lucide-react";
import { NETWORKS, type Network, type NetworkId } from "@/data/bundles";
import { formatGHS } from "@/lib/format";
import { loadPhase1Products, type Phase1Product } from "@/lib/phase1-api";
import snapshot from "@/data/catalog.snapshot.json";
import { useFlows } from "@/store/flows";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";
import { speedPill, useDeliverySpeed } from "@/hooks/useDeliverySpeed";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { reportClientError } from "@/lib/client-errors";
import { Info } from "lucide-react";
import MtnCheckField from "@/components/mtn/MtnCheckField";
import MtnCheckInfoSheet from "@/components/mtn/MtnCheckInfoSheet";
import { useAuth } from "@/store/auth-context";
import { usePromoPrices } from "@/lib/promotions";

/**
 * The shop floor: every live bundle, on the page itself.
 *
 * The shop sells the catalogue at the catalogue prices and each order routes
 * behind the scenes to the network's supplier. The shopper never sees or
 * chooses a supplier.
 *
 * With no filter on, bundles are grouped by network in catalogue order — MTN
 * first — rather than interleaved by price, so a shopper who came for one
 * network never has to hunt. Every bundle a network sells is on screen —
 * nothing hides behind a "see all", so nobody mistakes the catalogue for a
 * short one.
 *
 * Tapping a card opens the existing BuyDataFlow on the recipient step with
 * the bundle already chosen.
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

/** Same mapping the buy flow uses — the network lives in the product code. */
const CODE_PREFIX: Record<NetworkId, string> = { mtn: "mtn", telecel: "tel", at: "at" };

function networkForCode(code: string | null): Network | null {
  if (!code) return null;
  return NETWORKS.find((n) => code.startsWith(CODE_PREFIX[n.id])) ?? null;
}

/** Catalogue names read "MTN — 5GB"; the part after the dash is the headline. */
function toRowFromProduct(product: Phase1Product): Row | null {
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
  return /no expiry|non.?expiry/i.test(validity) ? "No expiry" : `Valid ${validity}`;
}

/* ── Card ────────────────────────────────────────────────────────── */

function BundleCard({ row, onBuy }: { row: Row; onBuy: () => void }) {
  const validity = statedValidity(row.validity);
  return (
    <button
      type="button"
      onClick={onBuy}
      className="mk-bundle group min-h-[112px] !p-4 sm:min-h-[124px] sm:!p-5"
      aria-label={`Buy ${row.network.name} ${row.size} for ${formatGHS(row.price)}`}
    >
      <span
        className={cn(
          "block break-words font-display font-semibold leading-[1.04] tracking-[-0.035em] text-foreground",
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
        <span className="inline-flex items-center rounded-full bg-primary/[0.14] px-3 py-1 text-[12.5px] font-semibold text-primary-glow">
          Buy
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
  const speeds = useDeliverySpeed();
  const { isAdmin } = useAdminAccess(); // the error detail is for the team, not customers
  const [checkInfoOpen, setCheckInfoOpen] = useState(false);
  const { openBuyData } = useFlows();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  // Bundles and prices come straight from the catalogue; each order routes to
  // the network's supplier behind the scenes. The build-time snapshot is the first render (pre-rendered HTML
  // included), so the grid is never empty; the live catalogue replaces it as soon as it arrives.
  const [products, setProducts] = useState<Phase1Product[]>(snapshot.products as Phase1Product[]);
  const [productsState, setProductsState] = useState<LoadState>("ready");
  const [productsError, setProductsError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    setProductsState((st) => (st === "error" ? "loading" : st));
    // A slow or dropped request shouldn't show the "not loading" card straight away:
    // try three times (0s, 2s, 5s) before giving up.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tryLoad = (n: number) => {
      void loadPhase1Products().then((result) => {
        if (!mounted) return;
        const ok = !result.error && result.data.length > 0;
        if (ok) { setProducts(result.data); setProductsState("ready"); setProductsError(null); return; }
        if (n < 2) { timer = setTimeout(() => tryLoad(n + 1), n === 0 ? 2000 : 5000); return; }
        reportClientError("products", result.error ?? "No bundles were returned.", { attempts: 3 });
        // The snapshot keeps selling; the "not loading" card is only for an empty grid.
        setProducts((have) => { if (have.length) return have; setProductsState("error"); setProductsError(result.error ?? "No bundles were returned."); return result.data; });
      });
    };
    tryLoad(0);
    return () => { mounted = false; if (timer) clearTimeout(timer); };
  }, [attempt]);

  const state: LoadState = productsState;

  // Promotion link visitors see the promotion price as the bundle price, nothing else changes.
  const { user } = useAuth();
  const promoPrices = usePromoPrices(user?.id ?? null);
  const rows = useMemo(() => products.map(toRowFromProduct).filter((row): row is Row => row !== null)
    .map((row) => (promoPrices[row.id] != null ? { ...row, price: promoPrices[row.id] } : row)), [products, promoPrices]);

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
      {/* Network tabs first: the first thing on the page is the thing to choose. Search is the small tool beside them. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="grid grid-cols-4 gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.03] p-1 sm:inline-grid sm:w-auto" role="tablist" aria-label="Network">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              title={`${counts.get(f.id) ?? 0} bundles`}
              className={cn(
                "rounded-full px-2 py-2 text-center text-[13px] font-semibold leading-none transition-colors sm:px-4",
                filter === f.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {state === "ready" && (
          <label className="onyx-search flex w-full shrink-0 items-center gap-2.5 !py-2 sm:w-[220px]">
            <Search size={15} className="shrink-0 text-faint-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 5GB…"
              aria-label="Search bundles"
              className="w-full min-w-0 bg-transparent text-[16px] tracking-tight text-foreground outline-none placeholder:text-faint-foreground sm:text-[14px]"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="shrink-0 text-faint-foreground transition-colors hover:text-foreground">
                <X size={15} />
              </button>
            )}
          </label>
        )}
      </div>

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
              {isAdmin && productsError && <p className="mt-2 break-words text-[11.5px] leading-5 text-faint-foreground">Details: {productsError}</p>}
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
                        {group.network.name === "MTN" && speedPill(speeds.MTN) ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold ${speedPill(speeds.MTN)!.paused ? "border-white/[0.12] bg-white/[0.05] text-muted-foreground" : "border-primary-glow/20 bg-primary/[0.08] text-primary-glow"}`} title="Typical time from payment to delivery right now, counting orders still in progress">
                            <span className={`h-1.5 w-1.5 rounded-full ${speedPill(speeds.MTN)!.paused ? "bg-faint-foreground" : "bg-primary-glow"}`} />{speedPill(speeds.MTN)!.text}
                          </span>
                        ) : (<>
                          <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                            {group.network.name} bundles
                          </span>
                          <span className="tnum text-[12.5px] text-faint-foreground">
                            {group.rows.length}
                          </span>
                        </>)}
                      </h3>
                    </div>
                    {group.network.name === "MTN" && (
                      <div className="mb-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                        <div className="mb-2 flex items-center gap-1.5"><p className="text-[13px] font-semibold text-foreground">First time buying for this MTN number? Check it first</p><button type="button" onClick={() => setCheckInfoOpen(true)} aria-label="About the MTN number check" className="text-faint-foreground hover:text-primary-glow"><Info size={15} /></button></div>
                        <MtnCheckField source="shop" />
                        <MtnCheckInfoSheet open={checkInfoOpen} onClose={() => setCheckInfoOpen(false)} />
                      </div>
                    )}

                    <BundleGrid rows={group.rows} onBuy={buy} />
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
