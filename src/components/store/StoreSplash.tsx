import { readStoreBrand } from "@/lib/storeBrand";

/* The store's loading screen: the store's own name and logo (remembered from the last visit) over a plain
   background, with a spinner. Shown while the store is being looked up or its page is loading. It is the same
   screen index.html shows before the app has started, so a refresh goes from one to the other without a flicker,
   and nothing of the main DataYego site is ever on screen in between. The styles live in index.html (.yg-splash). */
export default function StoreSplash() {
  const brand = readStoreBrand();
  const background = brand?.template === "market" ? "#fff8ec" : brand?.template === "studio" ? "#fff" : undefined;
  return (
    <div className="yg-splash is-on" role="status" aria-live="polite" style={background ? { background } : undefined}>
      {brand?.logo && <img className="yg-splash-logo" src={brand.logo} alt="" />}
      {brand?.name && <p className="yg-splash-name">{brand.name}</p>}
      <span className="yg-splash-spin" style={brand?.accent ? { borderTopColor: brand.accent } : undefined} aria-hidden="true" />
      <span className="sr-only">Loading{brand?.name ? ` ${brand.name}` : ""}…</span>
    </div>
  );
}
