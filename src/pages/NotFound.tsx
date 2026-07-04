import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="onyx-canvas flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="font-display text-6xl font-bold text-white">404</h1>
        <p className="mt-2 text-muted-foreground">This page doesn't exist yet.</p>
      </div>
      <Link to="/" className={cn(buttonVariants({ variant: "soft" }), "gap-2")}>
        <Home className="h-4 w-4" />
        Go home
      </Link>
    </div>
  );
}
