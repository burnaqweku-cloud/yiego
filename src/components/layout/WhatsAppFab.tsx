/* The WhatsApp floating button, shared by the main site and every agent store:
   the official glyph on a glossy green disc with a soft glow and a small attention dot. */
export function WhatsAppGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true" style={{ display: "block" }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export default function WhatsAppFab({ href, label = "Chat on WhatsApp", className = "", badge = true }: { href: string; label?: string; className?: string; badge?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
      className={`pointer-events-auto relative grid h-16 w-16 place-items-center rounded-full transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${className}`}
      style={{ backgroundColor: "#25D366", backgroundImage: "linear-gradient(180deg, #2fe06f 0%, #25D366 55%, #1fbe5b 100%)", boxShadow: "0 6px 18px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.04) inset" }}>
      <WhatsAppGlyph size={38} />
      {badge && <span className="absolute -right-0.5 -top-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-white text-[12px] font-extrabold leading-none text-white" style={{ backgroundColor: "#ff2d2d" }} aria-hidden="true">!</span>}
    </a>
  );
}
