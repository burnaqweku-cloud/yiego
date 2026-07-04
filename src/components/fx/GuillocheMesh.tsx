import { useEffect, useRef } from "react";

/**
 * Guilloché rosette mesh drawn on canvas — the security-print engraving
 * you see on real premium cards. Gives the wallet a physical, minted feel.
 */
export default function GuillocheMesh() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = Math.max(0.5, 0.6 * dpr);
      const cx = w * 0.72;
      const cy = h * 0.5;
      for (let r = 8 * dpr; r < Math.max(w, h) * 1.1; r += 9 * dpr) {
        ctx.beginPath();
        const petals = 7;
        const amp = 5 * dpr;
        for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.06) {
          const wobble = amp * Math.sin(a * petals + r * 0.04);
          const rr = r + wobble;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr * 0.62;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const alpha = 0.05 + 0.03 * Math.sin(r * 0.02);
        ctx.strokeStyle = `rgba(124, 240, 180, ${alpha})`;
        ctx.stroke();
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      draw();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
    />
  );
}
