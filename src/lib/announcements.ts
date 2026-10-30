import { supabase } from "@/integrations/supabase/client";
import { cached, invalidate } from "@/lib/requestCache";

export interface Announcement { id: string; title: string; body: string; kind: "update" | "price" | "notice" | "warning"; audience: string; link_url: string | null; link_label: string | null; is_pinned: boolean; is_urgent?: boolean; starts_at: string; read: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
const GUEST_KEY = "yg-announcements-read";

function guestRead(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(GUEST_KEY) ?? "[]")); } catch { return new Set(); } }

/** Announcements for this viewer; guest read-state is kept on the device. */
export async function loadAnnouncements(): Promise<Announcement[]> {
  const { data: session } = await supabase.auth.getSession();
  // The bell, the banner and the agent shell all ask on the same page load: share one request for 2 minutes.
  const list = await cached(`ann:${session?.session?.user?.id ?? "guest"}`, 2 * 60_000, async () => {
    const { data, error } = await p1().rpc("my_announcements", {});
    return { list: (data as Announcement[]) ?? [], ok: !error };
  }, { keep: (v) => v.ok }).then((v) => v.list);
  if (!session?.session) { const seen = guestRead(); return list.map((a) => ({ ...a, read: seen.has(a.id) })); }
  return list;
}
export async function markRead(id: string) {
  const { data: session } = await supabase.auth.getSession();
  if (session?.session) { await p1().rpc("mark_announcement_read", { p_id: id }); invalidate("ann:"); return; }
  const seen = guestRead(); seen.add(id); localStorage.setItem(GUEST_KEY, JSON.stringify([...seen]));
}
export const KIND_LABEL: Record<Announcement["kind"], string> = { update: "Update", price: "Price change", notice: "Notice", warning: "Important" };
