import { useEffect, useMemo, useState } from "react";
import { Megaphone, Tag, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { p1, useAgent } from "@/components/agent/AgentShell";
import Section from "@/components/agent/Section";
import ManagedList from "@/components/agent/ManagedList";
import { formatGHS } from "@/lib/format";

/* Announcements to the store's customers, and promos on bundles. Store-only; never below agent price. */
interface Ann { id: string; title: string; body: string; is_active: boolean; emailed_at: string | null; created_at: string }
interface Promo { id: string; product_id: string; promo_price: number; ends_at: string }

export default function AgentMarketing() {
  const { agent, products, prices } = useAgent();
  const [anns, setAnns] = useState<Ann[]>([]); const [promos, setPromos] = useState<Promo[]>([]);
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const [promoProduct, setPromoProduct] = useState(""); const [promoPrice, setPromoPrice] = useState(""); const [promoDays, setPromoDays] = useState("3");
  const load = async () => {
    const [a, p] = await Promise.all([p1().from("store_announcements").select("*").order("created_at", { ascending: false }).limit(500), p1().from("store_promos").select("*").gt("ends_at", new Date().toISOString()).order("ends_at")]);
    setAnns(a.data ?? []); setPromos(p.data ?? []);
  };
  useEffect(() => { void load(); }, []);
  const active = useMemo(() => products.filter((p) => !p.is_paused), [products]);
  const chosen = active.find((p) => p.id === promoProduct);
  const floor = chosen ? Number(chosen.agent_price ?? chosen.customer_price) : 0;
  const current = chosen ? Number(prices[chosen.id] ?? chosen.store_default_price ?? chosen.customer_price) : 0;

  const post = async () => {
    if (!title.trim() || !body.trim()) return toast.error("Write a title and a message.");
    setBusy("post"); const { error } = await p1().rpc("agent_post_announcement", { p_title: title, p_body: body }); setBusy(null);
    if (error) return toast.error(error.message.includes("limit_5") ? "Up to 5 announcements a day." : error.message.replace(/_/g, " "));
    setTitle(""); setBody(""); toast.success("Posted to your store."); void load();
  };
  const email = async (id: string) => {
    if (!window.confirm("Email this announcement to everyone who signed up on your store? You can do this once a day.")) return;
    setBusy(id);
    const { data, error } = await supabase.functions.invoke<{ sent?: number; customers?: number; error?: string }>("agent-notify", { body: { kind: "announce", announcementId: id } });
    setBusy(null);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Couldn't send.");
    toast.success(`Emailed ${data?.sent ?? 0} of ${data?.customers ?? 0} customers.`); void load();
  };
  const hide = async (id: string) => { await p1().from("store_announcements").update({ is_active: false }).eq("id", id); void load(); };
  const unhide = async (id: string) => { await p1().from("store_announcements").update({ is_active: true }).eq("id", id); void load(); };
  const setPromo = async () => {
    const price = Number(promoPrice); const days = Number(promoDays);
    if (!chosen || !(price > 0)) return toast.error("Pick a bundle and a price.");
    setBusy("promo");
    const { error } = await p1().rpc("agent_set_promo", { p_product: chosen.id, p_price: price, p_ends_at: new Date(Date.now() + days * 86_400_000).toISOString() });
    setBusy(null);
    if (error) return toast.error(error.message.includes("below_agent") ? `Promo can't go below your agent price (${formatGHS(floor)}).` : error.message.includes("not_lower") ? `Promo must be lower than your current price (${formatGHS(current)}).` : error.message.replace(/_/g, " "));
    toast.success("Promo is live on your store."); setPromoPrice(""); void load();
  };
  const endPromo = async (id: string) => { await p1().from("store_promos").delete().eq("id", id); void load(); };
  const name = (id: string) => (products.find((p) => p.id === id)?.name ?? "").replace(" Data — ", " ");

  return (
    <div className="space-y-6">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Marketing</p><h1 className="font-display text-[24px] font-semibold text-foreground">Talk to your customers</h1><p className="mt-1 text-[13px] text-muted-foreground">Announcements show on {agent.store_name}; you can also email them to people who signed up there. Promos drop a bundle's price for a few days.</p></div>

      <Section page="marketing" id="announcement" title="Announcement" icon={<Megaphone size={15} />} defaultOpen>
        <div className="mt-3 space-y-2"><div><input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="Title, e.g. Weekend data deals" className="onyx-field w-full" /><p className="mt-1 text-right text-[11px] text-faint-foreground">{title.length}/60</p></div><div><textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 240))} rows={3} placeholder="What do you want your customers to know? Keep it short; it shows in a small panel on your store." className="onyx-field w-full resize-y" /><p className="mt-1 text-right text-[11px] text-faint-foreground">{body.length}/240</p></div><div className="flex justify-end"><button type="button" disabled={busy === "post"} onClick={() => void post()} className="onyx-btn-primary px-4 py-2 text-[13px] disabled:opacity-60">Post to store</button></div></div>
        <div className="mt-5"><ManagedList items={anns} filters={[{ id: "all", label: "All" }, { id: "on", label: "On the store" }, { id: "off", label: "Removed" }]} filterOf={(a) => (a.is_active ? "on" : "off")} searchText={(a) => `${a.title} ${a.body}`} pageSize={8} empty="No announcements yet. Post one above; it shows under the bell on your store, newest first."
          render={(a) => <div className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={`text-[13.5px] font-semibold ${a.is_active ? "text-foreground" : "text-faint-foreground line-through"}`}>{a.title}</p><p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{a.body}</p><p className="mt-1 text-[11px] text-faint-foreground">{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{a.emailed_at ? " · emailed" : ""}</p></div><div className="flex shrink-0 flex-col items-end gap-1">{a.is_active && !a.emailed_at && <button type="button" disabled={busy === a.id} onClick={() => void email(a.id)} className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] px-2.5 py-1 text-[11.5px] text-foreground"><Mail size={12} />{busy === a.id ? "Sending…" : "Email customers"}</button>}{a.is_active ? <button type="button" onClick={() => void hide(a.id)} className="text-[11.5px] text-faint-foreground">Remove from store</button> : <button type="button" onClick={() => void unhide(a.id)} className="text-[11.5px] text-primary-glow">Put back</button>}</div></div></div>}
          countLabel={(n) => `${n} announcement${n === 1 ? "" : "s"}`} /></div>
      </Section>

      <Section page="marketing" id="promo" title="Promo" icon={<Tag size={15} />} subtitle="A lower price on one bundle for up to 30 days. It can't go below your agent price, so you never sell at a loss.">
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <select value={promoProduct} onChange={(e) => setPromoProduct(e.target.value)} className="onyx-field"><option value="">Choose a bundle</option>{active.map((p) => <option key={p.id} value={p.id}>{p.name.replace(" Data — ", " ")} · now {formatGHS(Number(prices[p.id] ?? p.store_default_price ?? p.customer_price))}</option>)}</select>
          <input value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} inputMode="decimal" placeholder={chosen ? `Price (min ${floor.toFixed(2)})` : "Promo price"} className="onyx-field w-full sm:w-40" />
          <select value={promoDays} onChange={(e) => setPromoDays(e.target.value)} className="onyx-field"><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select>
        </div>
        {chosen && <p className="mt-2 text-[11.5px] text-faint-foreground">Your price now {formatGHS(current)} · your cost {formatGHS(floor)} · promo profit {promoPrice ? formatGHS(Math.max(0, Number(promoPrice) - floor)) : "—"} per sale</p>}
        <div className="mt-3 flex justify-end"><button type="button" disabled={busy === "promo"} onClick={() => void setPromo()} className="onyx-btn-primary px-4 py-2 text-[13px] disabled:opacity-60">Start promo</button></div>
        <div className="mt-5"><ManagedList items={promos} searchText={(p) => name(p.product_id)} pageSize={8} empty="No promos running."
          render={(p) => <div className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block text-[13.5px] font-semibold text-foreground">{name(p.product_id)} at {formatGHS(Number(p.promo_price))}</span><span className="block text-[11.5px] text-faint-foreground">ends {new Date(p.ends_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></span><button type="button" onClick={() => void endPromo(p.id)} className="text-[12px] text-faint-foreground">End now</button></div>}
          countLabel={(n) => `${n} running`} /></div>
      </Section>
    </div>
  );
}
