import { useEffect, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { Check, MessageCircle, ReceiptText, ShieldCheck } from "lucide-react";
import { useContactSettings } from "@/hooks/useContactSettings";
import { agoLabel, boardRows, cameFromAdvert, loadProof, networkMark, type ProofDelivery } from "@/lib/advertProof";
import "./advert-proof.css";

const REFRESH_MS = 60_000;
const TURN_MS = 3200;
const ON_SHOW = 3;

/* What a stranger from an advert needs before paying someone they have never heard of: that other people's orders
   are going out right now, how the payment is protected, that their own order can be followed, and a person to ask.
   Shown above the bundles to advert visitors only; everyone else already knows us. The rows are real deliveries.
   It shows no totals and never mentions refunds or failure: a small count reads as "new", and naming a doubt plants
   it (owner, 13 Nov 2026). When too little has gone out lately the card is not shown at all. */
export default function AdvertProof() {
  const { search } = useLocation();
  const [show] = useState(() => cameFromAdvert(search));
  const [rows, setRows] = useState<ProofDelivery[] | null>(null);
  const [turn, setTurn] = useState(0);
  const { whatsappUrl } = useContactSettings();

  useEffect(() => {
    if (!show) return;
    let alive = true;
    const read = () => { void loadProof().then((next) => { if (alive) setRows(next); }); };
    read();
    const timer = window.setInterval(() => { if (!document.hidden) read(); }, REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [show]);

  const moving = (rows?.length ?? 0) > ON_SHOW;
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => setTurn((t) => t + 1), TURN_MS);
    return () => window.clearInterval(timer);
  }, [moving]);

  if (!show || !rows) return null;
  const onShow = boardRows(rows, turn, ON_SHOW);

  return (
    <section className="yg-proof" aria-label="Orders DataYego has just delivered">
      <div className="yg-proof__panel" aria-hidden="true" />
      <h2 className="yg-proof__title"><span className="yg-proof__dot" aria-hidden="true" />Just delivered</h2>
      <p className="yg-proof__sub">Real orders from the last hour.</p>

      <ul className="yg-proof__board">
        {onShow.map((row, i) => {
          const mark = networkMark(row.network);
          return (
            <li className="yg-proof__row" key={`${row.phone}-${row.gb}-${row.minutes}`} data-new={moving && turn > 0 && i === onShow.length - 1 ? "" : undefined}>
              <span className="yg-proof__net" data-tone={mark.tone} aria-hidden="true">{mark.text}</span>
              <p className="yg-proof__what"><b>{row.gb}GB</b><span className="sr-only"> {row.network}</span><em>to {row.phone}</em></p>
              <span className="yg-proof__when"><Check size={14} strokeWidth={3} aria-hidden="true" />{agoLabel(row.minutes)}</span>
            </li>
          );
        })}
      </ul>

      <ul className="yg-proof__points" style={{ "--n": whatsappUrl ? 3 : 2 } as CSSProperties}>
        <li><span className="yg-proof__point"><ShieldCheck size={17} aria-hidden="true" /><span>Secured by<b>Paystack</b></span></span></li>
        <li><span className="yg-proof__point"><ReceiptText size={17} aria-hidden="true" /><span>Every order<b>tracked</b></span></span></li>
        {whatsappUrl && <li><a className="yg-proof__point" href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} aria-hidden="true" /><span>Ask us on<b>WhatsApp</b></span></a></li>}
      </ul>
    </section>
  );
}
