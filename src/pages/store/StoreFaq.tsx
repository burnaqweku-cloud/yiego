import { useStore } from "@/components/store/StoreShell";
import StorePage from "@/components/store/StorePage";

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
    <StorePage title="Common questions" lead={`Everything people usually ask ${store.store_name} before they buy.`}>
    <section className={store.template === "studio" ? "border-b border-[var(--st-line)]" : "onyx-panel rounded-[22px] px-5 py-2"}>
      {items.map((f, i) => <details key={i} className="st-faq group"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-[14.5px] font-semibold text-foreground">{f.q}</summary><p className="pb-4 text-[13.5px] leading-6 text-muted-foreground">{f.a}</p></details>)}
    </section>
    </StorePage>
  );
}
