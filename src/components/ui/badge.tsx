import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        mint: "bg-primary-soft text-primary-strong",
        amber: "bg-amber-soft text-[hsl(30_90%_38%)]",
        dark: "bg-ink text-ink-foreground",
        outline: "border border-border bg-card text-muted-foreground",
        success: "bg-success-soft text-primary-strong",
        danger: "bg-danger-soft text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
