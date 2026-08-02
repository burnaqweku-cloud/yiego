import type { ReactNode } from "react";
import { Eye, X } from "lucide-react";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface AdminRecordField {
  label: string;
  value: ReactNode;
}

export function AdminDetailsButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} title={label}>
      <Eye />
    </Button>
  );
}

export default function AdminRecordModal({
  open,
  onClose,
  title,
  subtitle,
  fields,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fields: AdminRecordField[];
  children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} label={`${title} details`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-glow">Full details</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <Button variant="quiet" size="icon" onClick={onClose} aria-label="Close details"><X /></Button>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">{field.label}</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>

        {children && <div className="mt-6 border-t border-white/[0.08] pt-6">{children}</div>}
      </div>
    </Modal>
  );
}
