import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Image as ImageIcon, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { p1, useAgent } from "@/components/agent/AgentShell";
import { formatGHS } from "@/lib/format";
import { networkOf, sizeOf, statusCaption, statusImage, type StatusBundle, type StatusInput, type StatusKind, type StatusTemplate } from "@/lib/statusImage";

/* Status maker: a WhatsApp-status image for one bundle, a promo or a whole network,
   in the store's own template look, drawn from live prices. Download, share, caption. */
interface Promo { id: string; product_id: string; promo_price: number; ends_at: string }
const KINDS: Array<{ id: StatusKind; label: string }> = [{ id: "bundle", label: "One bundle" }, { id: "promo", label: "Promo" }, { id: "network", label: "Whole network" }];
const LOOKS: Array<{ id: StatusTemplate; label: string }> = [{ id: "market", label: "Market" }, { id: "studio", label: "Studio" }, { id: "classic", label: "Classic" }];
const NETS = ["MTN", "Telecel", "AirtelTigo"];

export default function AgentStatus() {
  const { agent, products, prices, storeUrl } = useAgent();
  const tpl = ((agent.template as StatusTemplate) || "classic") as StatusTemplate;
  const [kind, setKind] = useState<StatusKind>("bundle");
  const [look, setLook] = useState<StatusTemplate>(LOOKS.some((l) => l.id === tpl) ? tpl : "classic");
  const [network, setNetwork] = useState("MTN");
  const [productId, setProductId] = useState("");
  const [promos, setPromos] = useState<Promo[]>([]);
  const [promoId, setPromoId] = useState("");
  const [png, setPng] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasHost = useRef<HTMLDivElement>(null);

  useEffect(() => { void p1().from("store_promos").select("*").gt("ends_at", new Date().toISOString()).order("ends_at").then((r: { data: Promo[] | null }) => setPromos(r.data ?? [])); }, []);

  const active = useMemo(() => products.filter((p) => !p.is_paused), [products]);
  const byNet = useMemo(() => active.filter((p) => networkOf(p) === network).sort((a, b) => Number(a.capacity_gb ?? 0) - Number(b.capacity_gb ?? 0)), [active, network]);
  const priceOf = (id: string) => { const p = products.find((x) => x.id === id); return Number(prices[id] ?? p?.store_default_price ?? p?.customer_price ?? 0); };
  useEffect(() => { if (!byNet.some((p) => p.id === productId)) setProductId(byNet.find((p) => Number(p.capacity_gb) === 10)?.id ?? byNet[0]?.id ?? ""); }, [byNet, productId]);
  useEffect(() => { if (kind === "promo" && !promos.some((p) => p.id === promoId)) setPromoId(promos[0]?.id ?? ""); }, [kind, promos, promoId]);

  const input: StatusInput | null = useMemo(() => {
    const store = { name: agent.store_name, link: storeUrl, logoUrl: agent.logo_url ?? null, accent: agent.accent_color ?? null, tagline: agent.tagline ?? null };
    let bundles: StatusBundle[] = [];
    if (kind === "bundle") { const p = products.find((x) => x.id === productId); if (!p) return null; bundles = [{ product: p, price: priceOf(p.id) }]; }
    else if (kind === "promo") { const pr = promos.find((x) => x.id === promoId); const p = pr && products.find((x) => x.id === pr.product_id); if (!pr || !p) return null; bundles = [{ product: p, price: Number(pr.promo_price), wasPrice: priceOf(p.id), endsAt: pr.ends_at }]; }
    else { bundles = byNet.map((p) => ({ product: p, price: priceOf(p.id) })); if (!bundles.length) return null; }
    return { template: look, kind, store, bundles, network: kind === "network" ? network : networkOf(bundles[0].product) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, storeUrl, kind, look, productId, promoId, promos, byNet, products, prices, network]);

  useEffect(() => {
    let alive = true; setBusy(true);
    if (!input) { setPng(null); setUrl(null); setBusy(false); return; }
    void statusImage(input).then((b) => { if (!alive) return; setPng(b); setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b); }); setBusy(false); }).catch(() => { if (alive) { toast.error("Couldn't draw the image."); setBusy(false); } });
    return () => { alive = false; };
  }, [input]);

  const caption = input ? statusCaption(input) : "";
  const fileName = () => `${agent.slug}-${kind === "network" ? network.toLowerCase() : input ? `${networkOf(input.bundles[0].product)}-${sizeOf(input.bundles[0].product)}`.toLowerCase().replace(/\s+/g, "") : "status"}.png`;
  const share = async () => {
    if (!png) return;
    const file = new File([png], fileName(), { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text: caption }); return; } catch { /* cancelled */ } }
    download(); await navigator.clipboard.writeText(caption).catch(() => undefined); toast.success("Image saved and caption copied. Post it on WhatsApp.");
  };
  const download = () => { if (!url) return; const a = document.createElement("a"); a.href = url; a.download = fileName(); a.click(); };
  const copyCaption = async () => { await navigator.clipboard.writeText(caption); toast.success("Caption copied."); };
  const chip = (on: boolean) => `rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${on ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="space-y-4">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Marketing</p><h1 className="font-display text-[24px] font-semibold text-foreground">Status maker</h1><p className="mt-1 text-[13px] text-muted-foreground">A ready-to-post WhatsApp status in your store's look, with today's prices. Post one every day.</p></div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="onyx-panel rounded-2xl p-4">
            <p className="text-[12px] font-semibold text-foreground">What to post</p>
            <div className="mt-2 flex flex-wrap gap-2">{KINDS.map((k) => <button key={k.id} type="button" onClick={() => setKind(k.id)} className={chip(kind === k.id)}>{k.label}</button>)}</div>
            {kind === "promo" && promos.length === 0 && <p className="mt-3 text-[12.5px] text-muted-foreground">No promo running. Set one under Marketing → Promos and it will show here.</p>}
            {kind !== "promo" && <>
              <p className="mt-4 text-[12px] font-semibold text-foreground">Network</p>
              <div className="mt-2 flex flex-wrap gap-2">{NETS.map((n) => <button key={n} type="button" onClick={() => setNetwork(n)} className={chip(network === n)}>{n}</button>)}</div>
            </>}
            {kind === "bundle" && <>
              <p className="mt-4 text-[12px] font-semibold text-foreground">Bundle</p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{byNet.map((p) => <button key={p.id} type="button" onClick={() => setProductId(p.id)} className={`rounded-xl border px-2 py-2 text-left ${productId === p.id ? "border-primary/50 bg-primary/10" : "border-white/[0.08]"}`}><span className="block text-[14px] font-semibold text-foreground">{sizeOf(p)}</span><span className="block text-[11.5px] text-muted-foreground">{formatGHS(priceOf(p.id))}</span></button>)}</div>
            </>}
            {kind === "promo" && promos.length > 0 && <>
              <p className="mt-4 text-[12px] font-semibold text-foreground">Promo</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{promos.map((pr) => { const p = products.find((x) => x.id === pr.product_id); if (!p) return null; return <button key={pr.id} type="button" onClick={() => setPromoId(pr.id)} className={`rounded-xl border px-3 py-2 text-left ${promoId === pr.id ? "border-primary/50 bg-primary/10" : "border-white/[0.08]"}`}><span className="block text-[14px] font-semibold text-foreground">{networkOf(p)} {sizeOf(p)} · {formatGHS(Number(pr.promo_price))}</span><span className="block text-[11.5px] text-muted-foreground">was {formatGHS(priceOf(p.id))} · ends {new Date(pr.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></button>; })}</div>
            </>}
            <p className="mt-4 text-[12px] font-semibold text-foreground">Look</p>
            <div className="mt-2 flex flex-wrap gap-2">{LOOKS.map((l) => <button key={l.id} type="button" onClick={() => setLook(l.id)} className={chip(look === l.id)}>{l.label}{l.id === tpl ? " · your store" : ""}</button>)}</div>
          </div>

          <div className="onyx-panel rounded-2xl p-4">
            <p className="text-[12px] font-semibold text-foreground">Caption (shared with the image)</p>
            <p className="mt-1.5 rounded-xl bg-white/[0.03] px-3 py-2 text-[13px] text-foreground">{caption || "—"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={!png || busy} onClick={() => void share()} className="onyx-btn-primary px-5 py-2.5 text-[13.5px] disabled:opacity-50"><Share2 size={15} className="mr-1.5 inline" />Share to WhatsApp</button>
              <button type="button" disabled={!url || busy} onClick={download} className="rounded-[14px] border border-white/[0.1] px-4 py-2.5 text-[13.5px] text-foreground disabled:opacity-50"><Download size={15} className="mr-1.5 inline" />Download</button>
              <button type="button" disabled={!caption} onClick={() => void copyCaption()} className="rounded-[14px] border border-white/[0.1] px-4 py-2.5 text-[13.5px] text-foreground disabled:opacity-50"><Copy size={15} className="mr-1.5 inline" />Copy caption</button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-faint-foreground"><Sparkles size={12} />Prices on the image come from your store right now. Change a price and the next image follows.</p>
          </div>
        </div>

        <div ref={canvasHost} className="onyx-panel flex items-start justify-center rounded-2xl p-3">
          {url ? <img src={url} alt="Status preview" className={`w-full max-w-[300px] rounded-xl shadow-xl ${busy ? "opacity-60" : ""}`} style={{ aspectRatio: "9 / 16" }} /> : <div className="flex aspect-[9/16] w-full max-w-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.1] text-muted-foreground"><ImageIcon size={26} /><p className="mt-2 text-[12.5px]">{busy ? "Drawing…" : "Pick something to post."}</p></div>}
        </div>
      </div>
    </div>
  );
}
