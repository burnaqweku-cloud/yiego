import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/store/theme";
import { cn } from "@/lib/utils";

/**
 * Light / dark switch for the public site header. The icon is drawn after
 * mount: the pre-rendered HTML cannot know the visitor's theme, so the server
 * and the first client paint agree on an empty button and the icon follows.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setMode } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const light = resolved === "light";
  return (
    <button
      type="button"
      onClick={() => setMode(light ? "dark" : "light")}
      aria-label={mounted ? (light ? "Switch to dark mode" : "Switch to light mode") : "Switch theme"}
      title={mounted ? (light ? "Dark mode" : "Light mode") : undefined}
      className={cn("mk-theme", className)}
    >
      {mounted ? (light ? <Moon size={17} /> : <Sun size={17} />) : <span className="block h-[17px] w-[17px]" aria-hidden="true" />}
    </button>
  );
}
