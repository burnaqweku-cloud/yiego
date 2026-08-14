import fullDark from "@/assets/yiego-full-dark.png";
import fullLight from "@/assets/yiego-full.png";
import lockupDark from "@/assets/yiego-lockup-dark.png";
import lockupLight from "@/assets/yiego-lockup.png";
import { cn } from "@/lib/utils";

/**
 * The DataYego logo.
 *
 * Two files — the supplied artwork, and a variant with its near-black ink
 * lifted so it survives on the dark canvas. They are swapped by a CSS class
 * on <html>, not by JS, so the right one is correct on first paint and never
 * flashes. `display:none` also keeps the hidden copy out of the a11y tree,
 * which is why both may carry the same alt text.
 *
 * `variant="full"` includes the "Your everyday digital plug." tagline — only
 * use it at a size where that line can actually be read (~70px tall or more).
 *
 * Pass height through `className`; width stays automatic.
 */
export default function Wordmark({
  className,
  variant = "lockup",
}: {
  className?: string;
  variant?: "lockup" | "full";
}) {
  const [light, dark] = variant === "full" ? [fullLight, fullDark] : [lockupLight, lockupDark];
  const shared = cn("w-auto shrink-0 select-none", className);

  return (
    <>
      <img src={dark} alt="DataYego" draggable={false} className={cn("brand-dark", shared)} />
      <img src={light} alt="DataYego" draggable={false} className={cn("brand-light", shared)} />
    </>
  );
}
