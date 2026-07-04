import { cn } from "@/lib/utils";

/** The YieGo "YG" monogram mark — emerald gradient, embossed. */
export default function Monogram({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("onyx-monogram shrink-0", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      YG
    </span>
  );
}
