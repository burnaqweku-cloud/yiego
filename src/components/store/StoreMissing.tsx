import { useEffect } from "react";
import { Store } from "lucide-react";

/**
 * What a visitor sees when a store link leads nowhere: an address that is not
 * connected to any store, a slug that does not exist, or a store that is not
 * open. Neutral on purpose: a custom domain must never reveal the platform.
 */
export default function StoreMissing({ kind }: { kind: "no-store-at-address" | "not-open" | "could-not-load" }) {
  const title = kind === "not-open" ? "This store isn't open" : kind === "could-not-load" ? "This store could not be loaded" : "No store at this address";
  const text =
    kind === "not-open"
      ? "It may be paused for now, or the link may be wrong. Check the link you were sent, or ask the person who shared it."
      : kind === "could-not-load"
        ? "Check your connection and reload the page. If it keeps happening, ask the person who shared the link."
        : "This address isn't connected to a store yet. Check the link you were sent, or ask the person who shared it.";
  useEffect(() => { document.title = title; }, [title]);
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center" style={{ background: "#0b1512", color: "#fff", opacity: 1 }}>
      <div className="max-w-sm">
        <Store size={30} className="mx-auto" style={{ color: "rgba(255,255,255,0.45)" }} aria-hidden="true" />
        <h1 className="mt-4 text-[20px] font-semibold" style={{ color: "#fff" }}>{title}</h1>
        <p className="mt-2 text-[14px] leading-6" style={{ color: "rgba(255,255,255,0.7)" }}>{text}</p>
        {kind === "could-not-load" && (
          <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded-full px-5 py-2.5 text-[14px] font-semibold" style={{ background: "#fff", color: "#0b1512" }}>
            Reload
          </button>
        )}
      </div>
    </main>
  );
}
