import { toast } from "sonner";

/**
 * The one "not built yet" toast used across the whole app —
 * single source of copy so every surface sounds identical.
 */
export function comingSoonToast(name: string) {
  const verb = name.endsWith("s") ? "are" : "is";
  toast(`${name} ${verb} coming soon`, {
    description: "We're building YieGo service by service.",
  });
}
