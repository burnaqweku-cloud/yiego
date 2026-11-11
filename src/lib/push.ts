import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appDeviceId } from "@/lib/appInstall";

/* Phone notifications inside the Android app.
   The app's native bridge (window.Capacitor) is only present there, so in a browser every function
   here quietly does nothing. The phone gives us an address (a token); we save it, and the server
   sends "payment received", "data delivered" and announcements to it. */

export type PushState = "unsupported" | "prompt" | "granted" | "denied";

interface NativeBridge {
  nativePromise<T>(plugin: string, method: string, options?: unknown): Promise<T>;
  addListener(plugin: string, event: string, callback: (data: never) => void): { remove: () => Promise<void> };
}
const bridge = (): NativeBridge | null => {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: Partial<NativeBridge> }).Capacitor;
  return cap && typeof cap.nativePromise === "function" && typeof cap.addListener === "function" ? (cap as NativeBridge) : null;
};
interface Rpc { rpc<T>(name: string, args?: Record<string, unknown>): PromiseLike<{ data: T | null; error: unknown }> }
const phase1 = () => (supabase as unknown as { schema(name: string): Rpc }).schema("phase1");

let token: string | null = null;
let listening = false;

function saveToken() {
  if (!token) return;
  void Promise.resolve(phase1().rpc<boolean>("push_register", { p_device: appDeviceId(), p_channel: "fcm", p_token: token, p_platform: "android_app" })).then(undefined, () => undefined);
}

function listen(cap: NativeBridge) {
  if (listening) return;
  listening = true;
  cap.addListener("PushNotifications", "registration", ((data: { value?: string }) => { if (data?.value) { token = data.value; saveToken(); } }) as (data: never) => void);
  // While the app is open the phone shows nothing by itself, so the notification is shown on the page instead.
  cap.addListener("PushNotifications", "pushNotificationReceived", ((n: { title?: string; body?: string; data?: { url?: string } }) => {
    const path = n?.data?.url;
    toast(n?.title ?? "DataYego", { description: n?.body, duration: 8000, action: path && path.startsWith("/") ? { label: "Open", onClick: () => window.location.assign(path) } : undefined });
  }) as (data: never) => void);
}

/** Where this phone stands. "unsupported" covers browsers and older app versions without notifications. */
export async function pushState(): Promise<PushState> {
  const cap = bridge();
  if (!cap) return "unsupported";
  try {
    const { receive } = await cap.nativePromise<{ receive: string }>("PushNotifications", "checkPermissions");
    return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt";
  } catch { return "unsupported"; }
}

async function register(cap: NativeBridge) {
  listen(cap);
  try { await cap.nativePromise("PushNotifications", "register"); } catch { /* the phone will say why in a later attempt */ }
}

/** Asks the phone for permission (Android shows its own question) and, if allowed, registers this phone. */
export async function enablePush(): Promise<PushState> {
  const cap = bridge();
  if (!cap) return "unsupported";
  try {
    const { receive } = await cap.nativePromise<{ receive: string }>("PushNotifications", "requestPermissions");
    if (receive !== "granted") return receive === "denied" ? "denied" : "prompt";
    await register(cap);
    return "granted";
  } catch { return "unsupported"; }
}

/** At start-up: a phone that already allows notifications refreshes its address with us. */
export async function initPush() {
  const cap = bridge();
  if (!cap || (await pushState()) !== "granted") return;
  await register(cap);
}

/** After sign-in: ties this phone's address to the account, so orders made anywhere reach it. */
export function syncPushUser() { saveToken(); }

/** The phone that places an order asks to hear about it. This is what lets guests get their notifications. */
export function watchOrderForPush(orderReference: string | null | undefined) {
  if (!orderReference || !bridge()) return Promise.resolve();
  return Promise.race([
    Promise.resolve(phase1().rpc<boolean>("push_watch_order", { p_device: appDeviceId(), p_order_reference: orderReference })).then(() => undefined, () => undefined),
    new Promise<void>((done) => setTimeout(done, 2500)),
  ]);
}

/* Admin: the switches, the numbers and a test. */
export interface PushSettings { enabled: boolean; order_paid: boolean; order_delivered: boolean; order_refunded: boolean; announcements: boolean }
export interface PushOverview {
  settings: PushSettings | null; can_edit: boolean; phones: number; phones_signed_in: number; my_phones: number; sent_today: number;
  recent: { id: number; kind: string; title: string; body: string; status: string; recipients: number | null; delivered: number | null; error: string | null; created_at: string; sent_at: string | null }[];
}
export const loadPushOverview = () => phase1().rpc<PushOverview>("admin_push_overview");
export const savePushSettings = (settings: PushSettings) => phase1().rpc<PushSettings>("admin_push_save", { p_settings: settings });
export const sendPushTest = () => phase1().rpc<number>("admin_push_test");
