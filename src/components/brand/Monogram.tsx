import { cn } from "@/lib/utils";

/** The DataYego brand mark — the real app icon, framed like an app tile. */
export default function Monogram({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/yiego-icon-192.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      className={cn("shrink-0 select-none rounded-[26%] border border-white/10", className)}
      style={{
        width: size,
        height: size,
        boxShadow: "0 8px 22px -8px rgba(34, 195, 135, 0.55)",
      }}
    />
  );
}
