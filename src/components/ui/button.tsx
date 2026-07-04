import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] font-semibold tracking-[-0.01em] transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Emerald — the main brand action */
        primary:
          "bg-gradient-to-b from-primary-glow to-primary text-primary-foreground shadow-[0_12px_30px_-10px_hsl(var(--primary)/0.65),inset_0_1px_0_rgb(255_255_255/0.5)] hover:-translate-y-0.5 hover:brightness-[1.04]",
        /** Bordered dark — secondary */
        ghost:
          "border border-white/10 bg-white/[0.03] text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] hover:-translate-y-0.5 hover:border-primary-glow/35 hover:bg-primary-glow/[0.07]",
        /** Subtle emerald tint */
        soft: "bg-primary/[0.12] text-primary-glow border border-primary-glow/20 hover:bg-primary/[0.18]",
        /** Quiet text button */
        quiet: "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-11 w-11 rounded-[13px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
