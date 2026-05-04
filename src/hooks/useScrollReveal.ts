import { useEffect, useRef } from 'react';

/**
 * Lightweight scroll-reveal hook using IntersectionObserver.
 * Attach the returned ref to a container element.
 * Its children with `.reveal-on-scroll` will animate in when visible.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect prefers-reduced-motion
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      el.querySelectorAll('.reveal-on-scroll').forEach((child) => {
        (child as HTMLElement).style.opacity = '1';
        (child as HTMLElement).style.transform = 'none';
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    el.querySelectorAll('.reveal-on-scroll').forEach((child) => {
      observer.observe(child);
    });

    return () => observer.disconnect();
  }, []);

  return ref;
}
