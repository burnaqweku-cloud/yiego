import { supabase } from "@/integrations/supabase/client";

export interface AdminOrderRow {
  order_reference: string;
  recipient_phone: string;
  amount: number | string;
  status: string;
  payment_status: string;
  supplier_status: string | null;
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
  order: (column: string, options?: { ascending?: boolean }) => QueryChain<T>;
  limit: (count: number) => QueryChain<T>;
}
interface Phase1Client { from: <T>(table: string) => QueryChain<T> }

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
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatAdminDate(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
