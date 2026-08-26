import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** The shop's "Important notice", managed by admins in the database
 *  (Admin → Legal → Shop notice). The shipped wording below is the fallback
 *  while the row loads and the safety net if the read ever fails — the
 *  notice never blanks out. */

export interface SiteNotice {
  title: string;
  points: string[];
  mtn_note: string | null;
  is_published: boolean;
}

export const DEFAULT_NOTICE: SiteNotice = {
  title: "Important notice",
  points: [
    "Delivery times may vary.",
    "The receiving phone must not owe airtime.",
    "No refunds for orders sent to a wrong number — double-check before paying.",
  ],
  mtn_note:
    "MTN: a number ordering MTN data through us for the first time may show \u201CAwaiting Verification\u201D for a quick one-time check before it delivers. Future orders to that same number go through normally.",
  is_published: true,
};

export function useSiteNotice() {
  const [notice, setNotice] = useState<SiteNotice>(DEFAULT_NOTICE);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        interface Phase1Query {
          schema: (name: string) => {
            from: (table: string) => {
              select: (columns: string) => {
                eq: (column: string, value: string) => {
                  maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
                };
              };
            };
          };
        }
        const { data } = await (supabase as unknown as Phase1Query)
          .schema("phase1")
          .from("site_notices")
          .select("title, points, mtn_note, is_published")
          .eq("slug", "shop_important_notice")
          .maybeSingle();
        if (!active) return;
        if (!data) {
          // RLS hides unpublished rows, so "no row" means the admin has
          // unpublished the notice (or deleted it) — hide it, don't fall back.
          setNotice((n) => ({ ...n, is_published: false }));
          return;
        }
        const points = Array.isArray(data.points)
          ? data.points.map((p: unknown) => String(p)).filter(Boolean)
          : [];
        setNotice({
          title: String(data.title ?? DEFAULT_NOTICE.title),
          points,
          mtn_note: data.mtn_note ? String(data.mtn_note) : null,
          is_published: data.is_published !== false,
        });
      } catch {
        // The notice is safety copy — never let a read failure hide it.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return notice;
}
