import { adminDatabase } from "@/lib/admin-data";

/* Admin → Operations → Status. Team-wide switches stored in site_settings 'ops_status'. */
export const PROCESSING_DELAY_NOTE = "We apologise for the delay. Data deliveries are currently slower than usual across the networks, so this is not only on our side. Your money and your data are safe, and your bundle will be delivered as soon as processing is complete.";

export interface OpsStatus { processing_delay: boolean; updated_at: string | null; updated_by: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> }).rpc(f, a);

export async function loadOpsStatus(): Promise<OpsStatus> {
  const { data } = await rpc("admin_ops_status");
  return { processing_delay: Boolean(data?.value?.processing_delay), updated_at: data?.updated_at ?? null, updated_by: data?.updated_by ?? null };
}

export async function setProcessingDelay(on: boolean): Promise<string | null> {
  const { error } = await rpc("admin_set_ops_status", { p_processing_delay: on });
  return error ? error.message : null;
}

/* Front-end failures reported by phase1.log_client_error (see src/lib/client-errors.ts). */
export interface ClientError { id: number; at: string; page: string; source: string; message: string; email: string | null; context: Record<string, unknown> }
export async function loadClientErrors(hours = 48): Promise<ClientError[]> {
  const { data } = await rpc("admin_client_errors", { p_hours: hours });
  return Array.isArray(data) ? (data as ClientError[]) : [];
}
