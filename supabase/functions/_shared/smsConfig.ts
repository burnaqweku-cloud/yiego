import { DEFAULT_SMS_TEMPLATES, type SmsTemplates } from "./orderSmsTemplates.ts";

/* Admin → SMS settings and templates, read fresh on every run. Missing rows fall back to the defaults in code. */
export type SmsSettings = {
  senderId: string; purchaseEnabled: boolean; deliveredEnabled: boolean; verifiedEnabled: boolean;
  storeOrdersEnabled: boolean; onWayMaxHours: number; testNumbers: string[];
};

// deno-lint-ignore no-explicit-any
export async function loadSmsSettings(db: any): Promise<SmsSettings> {
  const { data } = await db.from("sms_settings").select("sender_id,purchase_enabled,delivered_enabled,verified_enabled,store_orders_enabled,on_way_max_hours,test_numbers").eq("id", true).maybeSingle();
  return {
    senderId: data?.sender_id ?? "DTYEGO",
    purchaseEnabled: data?.purchase_enabled ?? true,
    deliveredEnabled: data?.delivered_enabled ?? true,
    verifiedEnabled: data?.verified_enabled ?? true,
    storeOrdersEnabled: data?.store_orders_enabled ?? true,
    onWayMaxHours: Number(data?.on_way_max_hours ?? 48),
    testNumbers: Array.isArray(data?.test_numbers) ? data.test_numbers : [],
  };
}

// deno-lint-ignore no-explicit-any
export async function loadSmsTemplates(db: any): Promise<SmsTemplates> {
  const { data } = await db.from("sms_templates").select("kind,body");
  const out: SmsTemplates = { ...DEFAULT_SMS_TEMPLATES };
  for (const row of data ?? []) if (row?.kind in out && typeof row.body === "string" && row.body.trim()) out[row.kind as keyof SmsTemplates] = row.body;
  return out;
}

/** Remember what Vynfy said we have left, so admins see it without opening Vynfy. */
// deno-lint-ignore no-explicit-any
export async function recordSmsCredits(db: any, remaining: number | undefined) {
  if (typeof remaining !== "number" || !Number.isFinite(remaining)) return;
  await db.from("sms_settings").update({ credits_remaining: Math.round(remaining), credits_updated_at: new Date().toISOString() }).eq("id", true);
}
