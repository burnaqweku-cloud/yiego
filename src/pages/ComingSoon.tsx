import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Hammer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTION_TITLES: Record<string, string> = {
  "/services": "Services",
  "/payments": "Payments",
  "/wallet": "Wallet",
  "/more": "More",
};

export default function ComingSoon() {
  const { pathname } = useLocation();
  const section = SECTION_TITLES[pathname] ?? "This page";

  return (
    <div className="flex min-h-[calc(100dvh-176px)] animate-fade-up flex-col items-center justify-center text-center lg:min-h-[calc(100dvh-160px)]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
        <Hammer className="size-6" />
      </div>
      <h1 className="mt-5 font-display text-xl font-semibold tracking-tight">
        {section} is coming soon
      </h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        We're building YieGo piece by piece — this section is next on the list.
      </p>
      <Link to="/" className={cn(buttonVariants({ variant: "soft" }), "mt-6")}>
        <ArrowLeft />
        Back to Overview
      </Link>
    </div>
  );
}
