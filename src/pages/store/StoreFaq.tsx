import { useStore } from "@/components/store/StoreShell";

/* The store's FAQ: the agent's own questions, or the standard set if they haven't written any. */
export const DEFAULT_FAQ = (name: string): Array<{ q: string; a: string }> => [
  { q: "How fast is delivery?", a: "Usually within minutes of payment. MTN numbers receiving a bundle for the first time are verified by MTN first, which can take a few days; after that every order is fast." },
  { q: "How do I pay?", a: "Mobile money (MTN, Telecel, AirtelTigo) or card, at checkout. You get an order ID by email the moment payment goes through." },
  { q: "Can I buy for someone else?", a: "Yes. Enter their number as the recipient. The data goes to that number and the receipt comes to your email." },
  { q: "I entered the wrong number.", a: "If the number is on a different network from the bundle you chose, you can correct it from the Track page. A bundle already delivered to a number can't be reversed." },
  { q: "How do I track my order?", a: "Open Track order and enter your order ID or the phone number the data was sent to." },
  { q: "My order hasn't arrived.", a: `Check the Track page first. If it shows delivered but you don't see the data, dial *138# or check your balance. Otherwise message ${name} on WhatsApp with your order ID.` },
];
export default function StoreFaq() {
  const store = useStore();
  const items = store.faq?.length ? store.faq : DEFAULT_FAQ(store.store_name);
  return (
    <section className="onyx-panel rounded-[22px] p-5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-primary-glow">FAQ</p>
      <h1 className="mt-1 font-display text-[22px] font-semibold text-foreground">Common questions</h1>
      <div className="mt-3 divide-y divide-white/[0.06]">
        {items.map((f, i) => <details key={i} className="group py-3"><summary className="cursor-pointer list-none text-[14px] font-semibold text-foreground">{f.q}</summary><p className="mt-2 text-[13.5px] leading-6 text-muted-foreground">{f.a}</p></details>)}
      </div>
    </section>
  );
}
