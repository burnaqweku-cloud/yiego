import { supabase } from "@/integrations/supabase/client";

export interface AdminOrderRow {
  id: string;
  order_reference: string;
  recipient_phone: string;
  guest_email: string | null;
  amount: number | string;
  cost_amount: number | string | null;
  currency: string;
  status: string;
  payment_status: string;
  supplier_status: string | null;
  supplier_order_reference: string | null;
  failure_reason: string | null;
  admin_resolution_status: string | null;
  admin_resolution_reason: string | null;
  admin_resolution_updated_at: string | null;
  created_at: string;
  updated_at: string;
  data_products: { name: string; capacity_gb: number | string } | null;
  networks: { name: string; code: string } | null;
}

export interface AdminOrderEventRow {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
}

export interface AdminLedgerRow {
  reference: string;
  amount: number | string;
  direction: "credit" | "debit";
  type: string;
  created_at: string;
}

export interface SupplierLogRow {
  action: string;
  endpoint: string;
  http_status: number | null;
  call_status: string;
  supplier_reference?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface SupplierPackage {
  capacity: string;
  mb: string;
  price: string;
  network: string;
  inStock: boolean;
}

export interface SupplierPackageResponse {
  status: string;
  pricingTier: string;
  data: Record<string, SupplierPackage[]>;
}

interface DbError { message: string }
interface QueryChain<T> extends PromiseLike<{ data: T; error: DbError | null }> {
  select: (columns?: string) => QueryChain<T>;
  eq: (column: string, value: unknown) => QueryChain<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryChain<T>;
  limit: (count: number) => QueryChain<T>;
}
interface Phase1Client { from: <T>(table: string) => QueryChain<T[]> }

export function adminDatabase() {
  return (supabase as unknown as { schema: (schema: string) => Phase1Client }).schema("phase1");
}

export function supplierNetworkName(code: string) {
  if (code === "YELLO") return "MTN";
  if (code === "TELECEL") return "Telecel";
  if (code === "AT_PREMIUM") return "AirtelTigo Premium";
  if (code.toLowerCase() === "at") return "AirtelTigo Standard";
  return code;
}

export function readableStatus(status: string) {
  return status.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatAdminDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
