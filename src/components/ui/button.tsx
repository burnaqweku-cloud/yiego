import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Main brand action */
        primary: "bg-primary text-primary-foreground hover:bg-primary-strong shadow-sm",
        /** Deep ink — secondary hero action */
        dark: "bg-ink text-ink-foreground hover:bg-ink-soft",
        /** Mint tint — tertiary emphasis */
        soft: "bg-primary-soft text-primary-strong hover:bg-primary-soft/70",
        /** Bordered neutral */
        outline: "border border-border bg-card text-foreground hover:bg-muted",
        /** Quiet */
        ghost: "text-foreground hover:bg-muted",
        /** Solid white — for use ON dark surfaces */
        white: "bg-white text-ink hover:bg-white/90",
        /** Translucent — for use ON dark surfaces */
        glass: "border border-white/15 bg-white/10 text-white backdrop-blur-sm hover:bg-white/15",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-10 w-10 rounded-xl",
        iconSm: "h-9 w-9 rounded-lg",
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
