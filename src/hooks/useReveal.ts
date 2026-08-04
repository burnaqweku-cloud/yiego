import { useEffect, useRef } from "react";

/**
 * Scroll-reveal without a library: one shared IntersectionObserver adds
 * `is-revealed` to elements carrying `data-reveal`, once, then unobserves.
 *
 * Cheap by design — no scroll listener, no layout reads, no re-render.
 * Respects prefers-reduced-motion by revealing everything immediately.
 */

/**
 * Arm the hidden state only once this module is running. The CSS hides
 * `[data-reveal]` exclusively under `.reveal-ready`, so if JS never loads
 * (or this module fails), every section renders plainly visible instead of
 * disappearing. Runs at import time — before first paint, so no flash.
 */
if (typeof document !== "undefined") {
  document.documentElement.classList.add("reveal-ready");
}

let observer: IntersectionObserver | null = null;

function ensureObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        observer?.unobserve(entry.target);
      }
    },
    // Start the reveal slightly before the element reaches the fold so the
    // motion finishes as it settles into view.
    { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
  );
  return observer;
}

/**
 * Attach to any container; every `[data-reveal]` inside it (and the container
 * itself, if it carries the attribute) gets revealed on entry.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets: Element[] = [
      ...(root.hasAttribute("data-reveal") ? [root] : []),
      ...root.querySelectorAll("[data-reveal]"),
    ];

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const io = reduced ? null : ensureObserver();
    if (!io) {
      targets.forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    targets.forEach((el) => io.observe(el));
    return () => targets.forEach((el) => io.unobserve(el));
  }, []);

  return ref;
}
