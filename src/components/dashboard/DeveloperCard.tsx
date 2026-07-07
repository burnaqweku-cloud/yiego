import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Check, Code2, Copy } from "lucide-react";
import { useFlows } from "@/store/flows";

const SNIPPET = `curl https://api.yiego.com/v1/links \\
  -H "Authorization: Bearer sk_live_••••" \\
  -d amount=15000 \\
  -d currency=GHS \\
  -d title="Design retainer"`;

/** The Paystack-style payments + developer pillar — a real terminal, real trust. */
export default function DeveloperCard() {
  const [copied, setCopied] = useState(false);
  const { openCreateLink } = useFlows();
  const navigate = useNavigate();

  const copy = () => {
    navigator.clipboard?.writeText(SNIPPET).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="onyx-dev relative overflow-hidden rounded-[26px] p-6 sm:p-7">
      <span className="onyx-dev-glow" aria-hidden="true" />

      <div className="relative flex items-center gap-2 text-primary-glow">
        <Code2 size={16} />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.18em]">
          For developers
        </span>
      </div>

      <h3 className="relative mt-3 max-w-[22ch] font-display text-[22px] font-semibold leading-[1.08] tracking-[-0.02em] text-white sm:text-[25px]">
        Accept cedis in your app in one call.
      </h3>
      <p className="relative mt-2.5 max-w-[42ch] text-[13.5px] leading-relaxed text-muted-foreground">
        Payment links, checkout pages and payouts — the same rails powering the wallet, exposed as a
        clean REST API.
      </p>

      <div className="onyx-terminal relative mt-5">
        <div className="onyx-terminal-bar">
          <span className="onyx-dot" style={{ background: "#F5655B" }} />
          <span className="onyx-dot" style={{ background: "#F5B544" }} />
          <span className="onyx-dot" style={{ background: "#3FDD9A" }} />
          <span className="ml-2 font-mono text-[11px] text-[#6e8b7d]">create-link.sh</span>
          <button type="button" onClick={copy} className="onyx-copy ml-auto" aria-label="Copy code snippet">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="onyx-code">
          <code>
            <span className="text-[#5c7a6c]">$ </span>
            <span className="text-primary-glow">curl</span>{" "}
            <span className="text-[#b7c6be]">https://api.yiego.com/v1/links</span> \{"\n"}
            {"  "}-H <span className="text-[#e7c4a0]">"Authorization: Bearer sk_live_••••"</span> \
            {"\n"}
            {"  "}-d amount=<span className="text-amber">15000</span> \{"\n"}
            {"  "}-d currency=<span className="text-amber">GHS</span> \{"\n"}
            {"  "}-d title=<span className="text-[#e7c4a0]">"Design retainer"</span>
          </code>
        </pre>
      </div>

      <div className="relative mt-5 flex flex-wrap gap-3">
        <button type="button" className="onyx-btn-primary" onClick={openCreateLink}>
          Create payment link
          <ArrowUpRight size={16} strokeWidth={2.4} />
        </button>
        <button type="button" className="onyx-btn-ghost" onClick={() => navigate("/payments")}>
          API docs
        </button>
      </div>
    </div>
  );
}
