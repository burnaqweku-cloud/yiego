import { Fragment } from "react";
import { Link } from "react-router-dom";

/* Renders the only two inline marks blog copy may use: **bold** and
   [label](/path). Everything else is plain text, and the output is React
   nodes rather than injected HTML, so a post can never introduce markup.
   Internal paths become <Link> so they navigate without a full reload; the
   surrounding .mk-prose rules supply the link styling. */

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

export default function InlineText({ text }: { text: string }) {
  const parts = text.split(TOKEN).filter(Boolean);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }

        const link = LINK.exec(part);
        if (link) {
          const [, label, href] = link;
          if (href.startsWith("/")) {
            return <Link key={index} to={href}>{label}</Link>;
          }
          return (
            <a key={index} href={href} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          );
        }

        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}
