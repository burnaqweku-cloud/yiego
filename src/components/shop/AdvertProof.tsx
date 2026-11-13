import { useEffect, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { Check, MessageCircle, ReceiptText, ShieldCheck } from "lucide-react";
import { useContactSettings } from "@/hooks/useContactSettings";
import { agoLabel, cameFromAdvert, loadProof, networkMark, proofCount, recentCount, sinceLabel, type Proof } from "@/lib/advertProof";
import "./advert-proof.css";

const REFRESH_MS = 60_000;
const TURN_MS = 3200;

/* What a stranger from an advert needs before paying someone they have never heard of: that many others already
   have, that orders are going out right now, how the payment is protected, that their order can be followed, and a
   person to ask. It never mentions refunds or failure: naming the doubt plants it (owner, 13 Nov 2026). Shown above the
   bundles to advert visitors only; everyone else already knows us. All of it is read from the real records. */
export default function AdvertProof() {
  const { search } = useLocation();
  const [show] = useState(() => cameFromAdvert(search));
  const [proof, setProof] = useState<Proof | null>(null);
  const [turn, setTurn] = useState(0);
  const { whatsappUrl } = useContactSettings();

  useEffect(() => {
    if (!show) return;
    let alive = true;
    const read = () => { void loadProof().then((p) => { if (alive && p) setProof(p); }); };
    read();
    const timer = window.setInterval(() => { if (!document.hidden) read(); }, REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [show]);

  const rows = proof?.recent ?? [];
  useEffect(() => {
    if (rows.length < 2) return;
    const timer = window.setInterval(() => setTurn((t) => t + 1), TURN_MS);
    return () => window.clearInterval(timer);
  }, [rows.length]);

  if (!show || !proof) return null;
  const since = sinceLabel(proof.since);
  const lately = recentCount(proof);
  const row = rows.length ? rows[turn % rows.length] : null;
  const mark = row ? networkMark(row.network) : null;

  return (
    <section className="yg-proof" aria-label="Orders DataYego has delivered">
      <div className="yg-proof__panel" aria-hidden="true" />
      <div className="yg-proof__head">
        <p className="yg-proof__count">{proofCount(proof.delivered)}</p>
        <p className="yg-proof__label">orders delivered{since ? <><br />{since}</> : null}</p>
        {lately && (
          <div className="yg-proof__tag">
            <i aria-hidden="true"><Check size={20} strokeWidth={2.6} /></i>
            <div><small>{lately.when}</small><strong>{proofCount(lately.n)}<span>{lately.label}</span></strong></div>
          </div>
        )}
      </div>

      {row && mark && (
        <div className="yg-proof__feed">
          <div className="yg-proof__row" key={turn}>
            <span className="yg-proof__net" data-tone={mark.tone} aria-hidden="true">{mark.text}</span>
            <div className="yg-proof__what">
              <p><b>{row.gb}GB {row.network}</b><em>to {row.phone}</em></p>
              <p className="yg-proof__when"><span className="yg-proof__dot" aria-hidden="true" />Delivered {agoLabel(row.minutes)}</p>
            </div>
          </div>
        </div>
      )}

      <ul className="yg-proof__points" style={{ "--n": whatsappUrl ? 3 : 2 } as CSSProperties}>
        <li><span className="yg-proof__point"><ShieldCheck size={17} aria-hidden="true" /><span>Secured by<b>Paystack</b></span></span></li>
        <li><span className="yg-proof__point"><ReceiptText size={17} aria-hidden="true" /><span>Every order<b>tracked</b></span></span></li>
        {whatsappUrl && <li><a className="yg-proof__point" href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} aria-hidden="true" /><span>Ask us on<b>WhatsApp</b></span></a></li>}
      </ul>
    </section>
  );
}
