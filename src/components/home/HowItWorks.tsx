import { Link } from "react-router-dom";
import { STEPS } from "@/data/marketing";

/** How it works: a real sequence, so the numbers mean something. */
export default function HowItWorks() {
  return (
    <section className="mk-section" aria-labelledby="how-h">
      <div className="mk-wrap">
        <div className="max-w-[620px]">
          <span className="mk-eyebrow">How it works</span>
          <h2 id="how-h" className="mk-h2 mt-3">Four steps. About a minute.</h2>
          <p className="mk-lead mt-4 max-w-[48ch]">
            You do not need an account to buy. One is only worth it when you want a wallet and a record of
            every order you have placed.
          </p>
        </div>

        <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((step) => (
            <li key={step.n} className="step">
              <span className="step-n">{step.n}</span>
              <h3 className="step-t">{step.title}</h3>
              <p className="step-b">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12">
          <Link to="/shop" className="mk-btn mk-btn-primary w-full sm:w-auto">
            Start shopping
          </Link>
        </div>
      </div>
    </section>
  );
}
