import { useLocation } from "react-router-dom";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { comingSoonToast } from "@/lib/toasts";
import { MOCK_USER } from "@/data/mock";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const dateFormatter = new Intl.DateTimeFormat("en-GH", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const PAGE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/services": "Services",
  "/payments": "Payments",
  "/wallet": "Wallet",
  "/more": "More",
};

function BellButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Notifications"
      onClick={() => comingSoonToast("Notifications")}
      className="relative h-11 w-11 rounded-full [&_svg]:size-5"
    >
      <Bell />
      <span
        aria-hidden
        className="absolute right-2.5 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
      />
    </Button>
  );
}

function Avatar({ className = "h-10 w-10 text-sm" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 select-none items-center justify-center rounded-full bg-primary-soft font-bold text-primary-strong ${className}`}
    >
      {MOCK_USER.initials}
    </span>
  );
}

export default function TopBar() {
  const { pathname } = useLocation();
  const greeting = getGreeting();
  const today = dateFormatter.format(new Date());
  const title = PAGE_TITLES[pathname] ?? "Overview";

  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      {/* Mobile */}
      <div className="flex h-16 items-center gap-3 px-4 lg:hidden">
        <Avatar />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold tracking-tight">
            {greeting}, {MOCK_USER.firstName} <span aria-hidden>👋</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">{today}</p>
        </div>
        <BellButton />
      </div>

      {/* Desktop */}
      <div className="mx-auto hidden h-16 max-w-[1200px] items-center gap-6 px-8 lg:flex">
        <h1 className="font-display text-lg font-semibold tracking-tight">{title}</h1>

        <div className="flex min-w-0 flex-1 justify-center">
          <div className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-full bg-muted px-4 text-muted-foreground">
            <Search className="size-4 shrink-0" />
            <span className="truncate text-sm">Search services, transactions…</span>
            <kbd className="ml-auto shrink-0 rounded-md border border-border bg-card px-1.5 py-px font-sans text-[11px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <BellButton />
          <Avatar className="h-9 w-9 text-[13px]" />
        </div>
      </div>
    </header>
  );
}
