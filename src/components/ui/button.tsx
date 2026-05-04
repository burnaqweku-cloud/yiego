import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] select-none",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-primary to-[hsl(var(--gold-glow))] text-primary-foreground shadow-[0_2px_10px_hsl(var(--primary)/0.25)] hover:shadow-[0_4px_18px_hsl(var(--primary)/0.35)] hover:brightness-105 active:brightness-95",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm hover:shadow-md",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted/50 hover:border-primary/40",
        secondary:
          "bg-secondary text-secondary-foreground border border-border/60 hover:bg-secondary/80 hover:border-border",
        ghost:
          "hover:bg-muted/50 hover:text-foreground text-muted-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
        gold:
          "bg-gradient-to-r from-primary to-[hsl(var(--gold-glow))] text-primary-foreground font-semibold shadow-[0_2px_10px_hsl(var(--primary)/0.25)] hover:shadow-[0_4px_18px_hsl(var(--primary)/0.4)] hover:brightness-105",
        premium:
          "bg-gradient-to-br from-primary via-primary to-[hsl(var(--gold-glow))] text-primary-foreground font-semibold shadow-[0_4px_20px_hsl(var(--primary)/0.35),inset_0_1px_0_hsl(0_0%_100%/0.2)] hover:shadow-[0_6px_28px_hsl(var(--primary)/0.5),inset_0_1px_0_hsl(0_0%_100%/0.25)] hover:brightness-[1.04]",
        hero:
          "bg-gradient-to-r from-primary to-[hsl(var(--gold-glow))] text-primary-foreground font-bold text-base px-8 py-3 h-auto rounded-xl shadow-[0_4px_24px_hsl(var(--primary)/0.4)] hover:brightness-105 hover:shadow-[0_6px_32px_hsl(var(--primary)/0.55)] transition-all",
        "hero-outline":
          "border-2 border-white/30 text-white font-semibold text-base px-8 py-3 h-auto rounded-xl hover:bg-white/10 hover:border-white/50 transition-all backdrop-blur-sm",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-lg px-4",
        lg: "h-11 rounded-lg px-8",
        xl: "h-12 rounded-xl px-10 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
