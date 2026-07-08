import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader } from "@/components/flows/flow-parts";
import { cn } from "@/lib/utils";

/**
 * Mini API reference sheet — three core endpoints in the onyx-terminal
 * aesthetic, each with a really-copyable curl example.
 */

const KEY = "sk_live_demo_9f2ab84f2a";

type Method = "POST" | "GET";

interface Endpoint {
  method: Method;
  path: string;
  desc: string;
  file: string;
  curl: string;
  code: ReactNode;
}

/* Shared token colours for the highlighted curl blocks. */
const P = ({ children }: { children: ReactNode }) => (
  <span className="text-[#5c7a6c]">{children}</span>
); /* prompt  */
const C = ({ children }: { children: ReactNode }) => (
  <span className="text-primary-glow">{children}</span>
); /* command */
const U = ({ children }: { children: ReactNode }) => (
  <span className="text-[#b7c6be]">{children}</span>
); /* url     */
const S = ({ children }: { children: ReactNode }) => (
  <span className="text-[#e7c4a0]">{children}</span>
); /* string  */
const N = ({ children }: { children: ReactNode }) => (
  <span className="text-amber">{children}</span>
); /* number  */

const ENDPOINTS: Endpoint[] = [
  {
    method: "POST",
    path: "/v1/links",
    desc: "Create a shareable payment link in one call.",
    file: "create-link.sh",
    curl: `curl https://api.yiego.com/v1/links \\
  -H "Authorization: Bearer ${KEY}" \\
  -d amount=2500 \\
  -d currency=GHS \\
  -d title="Design retainer"`,
    code: (
      <>
        <P>$ </P>
        <C>curl</C> <U>https://api.yiego.com/v1/links</U> \{"\n"}
        {"  "}-H <S>"Authorization: Bearer {KEY}"</S> \{"\n"}
        {"  "}-d amount=<N>2500</N> \{"\n"}
        {"  "}-d currency=<N>GHS</N> \{"\n"}
        {"  "}-d title=<S>"Design retainer"</S>
      </>
    ),
  },
  {
    method: "GET",
    path: "/v1/balance",
    desc: "Read your available wallet balance in real time.",
    file: "check-balance.sh",
    curl: `curl https://api.yiego.com/v1/balance \\
  -H "Authorization: Bearer ${KEY}"`,
    code: (
      <>
        <P>$ </P>
        <C>curl</C> <U>https://api.yiego.com/v1/balance</U> \{"\n"}
        {"  "}-H <S>"Authorization: Bearer {KEY}"</S>
      </>
    ),
  },
  {
    method: "POST",
    path: "/v1/payouts",
    desc: "Send money to any MoMo number or bank account.",
    file: "send-payout.sh",
    curl: `curl https://api.yiego.com/v1/payouts \\
  -H "Authorization: Bearer ${KEY}" \\
  -d amount=6900 \\
  -d currency=GHS \\
  -d destination="momo:0241234567"`,
    code: (
      <>
        <P>$ </P>
        <C>curl</C> <U>https://api.yiego.com/v1/payouts</U> \{"\n"}
        {"  "}-H <S>"Authorization: Bearer {KEY}"</S> \{"\n"}
        {"  "}-d amount=<N>6900</N> \{"\n"}
        {"  "}-d currency=<N>GHS</N> \{"\n"}
        {"  "}-d destination=<S>"momo:0241234567"</S>
      </>
    ),
  },
];

function MethodBadge({ method }: { method: Method }) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-bold tracking-[0.04em]",
        method === "POST"
          ? "border border-primary-glow/25 bg-primary/12 text-primary-glow"
          : "border border-amber/25 bg-amber/10 text-amber",
      )}
    >
      {method}
    </span>
  );
}

export default function ApiDocsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    setCopiedPath(null);
  }, [open]);

  const copy = (e: Endpoint) => {
    navigator.clipboard?.writeText(e.curl).catch(() => {});
    setCopiedPath(e.path);
    window.setTimeout(() => setCopiedPath((p) => (p === e.path ? null : p)), 1600);
  };

  return (
    <Modal open={open} onClose={onClose} label="YieGo API reference">
      <FlowHeader title="API reference" subtitle="api.yiego.com · v1" onClose={onClose} />

      <div className="space-y-6 px-5 pb-2 pt-5">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Every rail behind your wallet — links, balances, payouts — is one authenticated HTTPS
          call away. Authenticate with your secret key as a Bearer token.
        </p>

        {ENDPOINTS.map((e) => {
          const copied = copiedPath === e.path;
          return (
            <section key={e.path}>
              <div className="flex items-center gap-2.5">
                <MethodBadge method={e.method} />
                <span className="font-mono text-[13.5px] font-semibold tracking-tight text-white">
                  {e.path}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{e.desc}</p>

              <div className="onyx-terminal mt-3">
                <div className="onyx-terminal-bar">
                  <span className="onyx-dot" style={{ background: "#F5655B" }} />
                  <span className="onyx-dot" style={{ background: "#F5B544" }} />
                  <span className="onyx-dot" style={{ background: "#3FDD9A" }} />
                  <span className="ml-2 font-mono text-[11px] text-[#6e8b7d]">{e.file}</span>
                  <button
                    type="button"
                    onClick={() => copy(e)}
                    className="onyx-copy ml-auto"
                    aria-label={`Copy ${e.method} ${e.path} curl example`}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="onyx-code">
                  <code>{e.code}</code>
                </pre>
              </div>
            </section>
          );
        })}

        <p className="text-center text-[12px] text-faint-foreground">
          Full docs ship with the public API beta.
        </p>
      </div>

      <FlowFooter>
        <button type="button" className="onyx-btn-primary w-full" onClick={onClose}>
          Done
        </button>
      </FlowFooter>
    </Modal>
  );
}
