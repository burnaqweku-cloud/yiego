import { supabase } from "@/integrations/supabase/client";

export interface Announcement { id: string; title: string; body: string; kind: "update" | "price" | "notice" | "warning"; audience: string; link_url: string | null; link_label: string | null; is_pinned: boolean; starts_at: string; read: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
const GUEST_KEY = "yg-announcements-read";

function guestRead(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(GUEST_KEY) ?? "[]")); } catch { return new Set(); } }

/** Announcements for this viewer; guest read-state is kept on the device. */
export async function loadAnnouncements(): Promise<Announcement[]> {
  const { data } = await p1().rpc("my_announcements", {});
  const list = (data as Announcement[]) ?? [];
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session) { const seen = guestRead(); return list.map((a) => ({ ...a, read: seen.has(a.id) })); }
  return list;
}
export async function markRead(id: string) {
  const { data: session } = await supabase.auth.getSession();
  if (session?.session) { await p1().rpc("mark_announcement_read", { p_id: id }); return; }
  const seen = guestRead(); seen.add(id); localStorage.setItem(GUEST_KEY, JSON.stringify([...seen]));
}
export const KIND_LABEL: Record<Announcement["kind"], string> = { update: "Update", price: "Price change", notice: "Notice", warning: "Important" };
