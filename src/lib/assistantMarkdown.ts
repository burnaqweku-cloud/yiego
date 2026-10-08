import DOMPurify from "dompurify";

/* ══════════════════════════════════════════════════════════════
   Renders the support assistant's replies. The persona prompt asks
   Claude for a small markdown subset — **bold**, "-" bullets,
   numbered steps, plain links — and this renders exactly that
   subset and nothing more. Everything is HTML-escaped first and
   DOMPurify-sanitised last, so a reply (or anything a customer
   tricked the model into echoing) can never inject markup.
   ══════════════════════════════════════════════════════════════ */

const ALLOWED = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "code", "ul", "ol", "li", "a"],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderInline(escaped: string) {
  return escaped
    // bold may wrap an escaped asterisk (e.g. **\*138#**); allow it inside and drop the backslash after
    .replace(/\*\*((?:\\\*|[^*\n])+)\*\*/g, (_m, inner: string) => `<strong>${inner.replace(/\\\*/g, "*")}</strong>`)
    .replace(/\\\*/g, "*")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
      if (href.startsWith("/")) return `<a href="${href}">${label}</a>`;
      if (/^https?:\/\//i.test(href)) return `<a href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>`;
      return match; // anything else (javascript:, mailto typos…) stays plain text
    });
}

const BULLET = /^[-*]\s+/;
const NUMBERED = /^\d+[.)]\s+/;

/** One-line plain text of a reply (for list previews): markdown markers removed. */
export function assistantPlain(text: string, max = 160): string {
  const t = text.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/\\\*/g, "*").replace(/`([^`\n]+)`/g, "$1").replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1").replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function assistantHtml(text: string): string {
  const blocks = escapeHtml(text.trim()).split(/\n{2,}/);
  const html = blocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return "";
    if (lines.every((line) => BULLET.test(line))) {
      return `<ul>${lines.map((line) => `<li>${renderInline(line.replace(BULLET, ""))}</li>`).join("")}</ul>`;
    }
    if (lines.every((line) => NUMBERED.test(line))) {
      return `<ol>${lines.map((line) => `<li>${renderInline(line.replace(NUMBERED, ""))}</li>`).join("")}</ol>`;
    }
    return `<p>${lines.map(renderInline).join("<br>")}</p>`;
  }).join("");
  return DOMPurify.sanitize(html, ALLOWED);
}
