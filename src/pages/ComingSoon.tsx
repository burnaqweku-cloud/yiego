import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Hammer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTION_TITLES: Record<string, string> = {
  "/services": "Services",
  "/payments": "Payments",
  "/wallet": "Wallet",
  "/account": "Account",
};

export default function ComingSoon() {
  const { pathname } = useLocation();
  const section = SECTION_TITLES[pathname] ?? "This page";

  return (
    <div className="onyx-rise flex min-h-[calc(100dvh-240px)] flex-col items-center justify-center text-center">
      <span
        className="grid h-16 w-16 place-items-center rounded-[20px] text-primary-glow"
        style={{
          background: "linear-gradient(180deg, rgba(34,195,135,0.16), rgba(34,195,135,0.04))",
          border: "1px solid rgba(124,240,180,0.16)",
          boxShadow: "0 18px 40px -20px rgba(34,195,135,0.5)",
        }}
      >
        <Hammer size={26} />
      </span>
      <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight text-white">
        {section} is coming soon
      </h1>
      <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        We're building YieGo piece by piece — this section is next on the list.
      </p>
      <Link to="/" className={cn(buttonVariants({ variant: "soft" }), "mt-7 gap-2")}>
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>
    </div>
  );
}
