import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Onyx modal — a bottom-sheet on mobile, a centered dialog on desktop.
 * Handles backdrop click, Escape, body scroll-lock, initial focus, a focus
 * trap (Tab can't reach the blurred background), and focus return on close.
 */
export default function Modal({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const prevActive = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      // If the focused element unmounted (step change), pull focus back in.
      if (!panelRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        (items[0] ?? panelRef.current)?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Return focus to whatever opened the modal.
      prevActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label}>
      <div className="onyx-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="onyx-modal-dock">
        <div ref={panelRef} tabIndex={-1} className="onyx-modal-panel no-scrollbar focus:outline-none">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
