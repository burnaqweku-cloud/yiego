import { Link } from "react-router-dom";
import { Mail, MessageCircle, Megaphone } from "lucide-react";
import Wordmark from "@/components/brand/Wordmark";
import { useContactSettings } from "@/hooks/useContactSettings";

/** Public footer — the site map, kept scannable. */

interface FooterLink {
  label: string;
  to?: string;
  href?: string;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Company",
    links: [
      { label: "About us", to: "/about" },
      { label: "Shop", to: "/shop" },
      { label: "Track an order", to: "/track-order" },
    ],
  },
  {
    // Every page links the money pages — sitewide internal links are the
    // strongest crawl signal the network landing pages get.
    title: "Data bundles",
    links: [
      { label: "All bundles", to: "/shop" },
      { label: "Bundle prices", to: "/prices" },
      { label: "MTN data bundles", to: "/mtn-data-bundles" },
      { label: "Telecel data bundles", to: "/telecel-data-bundles" },
      { label: "AirtelTigo data bundles", to: "/airteltigo-data-bundles" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help centre", to: "/support" },
      { label: "AI assistant", to: "/support/ai" },
      { label: "FAQ", to: "/faq" },
      { label: "Contact us", to: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of service", to: "/legal/terms" },
      { label: "Privacy policy", to: "/legal/privacy" },
      { label: "Refund policy", to: "/legal/refunds" },
    ],
  },
];

/** The only channel DataYego actually runs. No other social accounts exist, so
 *  none are linked — a dead icon costs more trust than an absent one. */
const WHATSAPP_CHANNEL = "https://whatsapp.com/channel/0029Vb7zmhX2f3EClS0Qao2S";

export default function PublicFooter() {
  const { contact, whatsappUrl } = useContactSettings();

  return (
    <footer className="mk-footer mt-auto">
      <div className="mk-wrap py-14 sm:py-16">
        <div className="grid gap-11 lg:grid-cols-[1.25fr_2.4fr]">
          {/* Brand */}
          <div className="max-w-[330px]">
            <Link to="/" className="flex items-center" aria-label="DataYego — home">
              <Wordmark className="h-[28px]" />
            </Link>
            <p className="mk-body mt-4 text-[13.5px]">
              Data bundles for MTN, Telecel and AirtelTigo — bought in seconds, delivered in
              minutes, tracked to the last cedi.
            </p>
            <a
              href={WHATSAPP_CHANNEL}
              target="_blank"
              rel="noreferrer noopener"
              className="mk-social mt-6 inline-flex w-auto items-center gap-2.5 px-4 text-[13.5px] font-semibold"
            >
              <Megaphone size={16} aria-hidden="true" />
              WhatsApp channel
            </a>
          </div>

          {/* Site map */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
                  {col.title}
                </p>
                <ul className="mt-3.5 flex flex-col">
                  {col.links.map((l, i) => (
                    <li key={`${l.label}-${i}`}>
                      {l.to ? (
                        <Link to={l.to} className="mk-footlink">
                          {l.label}
                        </Link>
                      ) : (
                        <a href={l.href} className="mk-footlink">
                          {l.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* Direct contact — only what is actually configured */}
        {(contact?.support_email || whatsappUrl) && (
          <div className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-white/[0.07] pt-7">
            {contact?.support_email && (
              <a
                href={`mailto:${contact.support_email}`}
                className="flex items-center gap-2 text-[13.5px] text-muted-foreground transition-colors hover:text-primary-glow"
              >
                <Mail size={15} />
                {contact.support_email}
              </a>
            )}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 text-[13.5px] text-muted-foreground transition-colors hover:text-primary-glow"
              >
                <MessageCircle size={15} />
                WhatsApp support
              </a>
            )}
            {contact?.business_hours && (
              <span className="text-[13px] text-faint-foreground">{contact.business_hours}</span>
            )}
          </div>
        )}

        <div className="mt-9 flex flex-col gap-3 border-t border-white/[0.07] pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-faint-foreground">
            © {new Date().getFullYear()} {contact?.business_name || "DataYego"}. All rights reserved.
          </p>
          <p className="text-[13px] text-faint-foreground">Built for Ghana 🇬🇭</p>
        </div>
      </div>
    </footer>
  );
}
