import { ArrowRight, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import Seo from "@/components/seo/Seo";

/* A real 404 instead of a silent redirect home: search engines stop indexing
   junk URLs as duplicates of the homepage, and people see where they are. */
export default function NotFound() {
  return (
    <section className="mk-section-tight">
      <Seo title="Page not found — DataYego" description="That page doesn't exist. Browse data bundles for MTN, Telecel and AirtelTigo instead." path="/404" noindex />
      <div className="mk-wrap py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-primary-glow"><Compass size={26} /></span>
        <h1 className="mk-display mt-7 !text-[clamp(30px,5vw,48px)]">This page doesn't exist</h1>
        <p className="mk-lead mx-auto mt-5 max-w-[46ch]">The link may be old or mistyped. The data bundles, prices and help pages are all still here.</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/shop" className="mk-btn mk-btn-primary group">Buy data<ArrowRight size={17} className="mk-arrow" aria-hidden="true" /></Link>
          <Link to="/prices" className="mk-btn mk-btn-ghost group">See bundle prices</Link>
          <Link to="/" className="mk-btn mk-btn-ghost group">Go home</Link>
        </div>
      </div>
    </section>
  );
}
