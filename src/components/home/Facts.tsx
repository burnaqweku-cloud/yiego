import { useLiveBundles } from "@/hooks/useLiveBundles";

/**
 * Plain facts, computed from the same catalogue the shop sells from — no
 * claims the data cannot back.
 */
export default function Facts() {
  const { byNetwork } = useLiveBundles();
  const all = Object.values(byNetwork).flat();
  const count = all.length;
  const cheapest = all.length ? Math.min(...all.map((b) => b.price)) : null;
  const biggest = all.length ? Math.max(...all.map((b) => b.capacityGb)) : null;

  const facts = [
    { n: "3", l: "networks: MTN, Telecel and AirtelTigo, on one site." },
    { n: String(count), l: `bundles on the board${biggest ? `, from 1GB up to ${biggest}GB` : ""}.` },
    { n: cheapest != null ? `GH₵${cheapest.toFixed(2)}` : "—", l: "is the cheapest bundle on the board today." },
    { n: "2", l: "ways to pay: Mobile Money or card, through Paystack." },
  ];

  return (
    <section className="mk-section-tight" aria-label="DataYego in numbers">
      <div className="mk-wrap">
        <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          {facts.map((f) => (
            <div key={f.l} className="fact">
              <dt className="fact-n">{f.n}</dt>
              <dd className="fact-l">{f.l}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
