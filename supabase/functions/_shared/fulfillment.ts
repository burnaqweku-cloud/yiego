import { callDataMartGH, mapDataMartGHStatusToYieGo } from "./datamartgh.ts";

interface SupabaseAdminClient {
  from: (table: string) => {
    select: (columns?: string) => unknown;
    update: (values: Record<string, unknown>) => unknown;
    insert: (values: Record<string, unknown>) => unknown;
  };
}

interface SupplierPurchasePayload {
  status?: string;
  message?: string;
  data?: {
    orderStatus?: string;
    orderReference?: string;
    purchaseId?: string;
    transactionReference?: string;
  };
}

export async function fulfillOrderWithDataMartGH(supabase: SupabaseAdminClient, orderId: string) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("order_not_found");

  if (order.supplier_order_reference) {
    return { skipped: true, reason: "already_has_supplier_reference", order };
  }

  const { data: product, error: productError } = await supabase
    .from("data_products")
    .select("*")
    .eq("id", order.product_id)
    .maybeSingle();

  if (productError) throw new Error(productError.message);
  if (!product) throw new Error("product_not_found");

  const { data: mapping, error: mappingError } = await supabase
    .from("supplier_product_mappings")
    .select("*, suppliers(*)")
    .eq("product_id", order.product_id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (mappingError) throw new Error(mappingError.message);
  if (!mapping) throw new Error("supplier_mapping_not_found");

  const idempotencyKey = order.supplier_idempotency_key ?? crypto.randomUUID();

  await supabase
    .from("orders")
    .update({
      status: "processing",
      supplier_id: mapping.supplier_id,
      supplier_idempotency_key: idempotencyKey,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: "supplier.fulfillment_started",
    from_status: order.status,
    to_status: "processing",
    message: "Sending paid order to DataMartGH",
    metadata: {
      supplier: "datamartgh",
      idempotencyKey,
    },
  });

  const requestPayload = {
    phoneNumber: order.recipient_phone,
    network: mapping.supplier_network_code,
    capacity: mapping.supplier_capacity,
    gateway: "wallet",
    ref: order.order_reference,
  };

  const result = await callDataMartGH("/purchase", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(requestPayload),
  });

  const supplierPayload = result.payload as SupplierPurchasePayload;
  const supplierData = supplierPayload?.data ?? {};
  const supplierStatus = supplierData.orderStatus ?? supplierPayload?.status;
  const nextStatus = result.ok
    ? mapDataMartGHStatusToYieGo(supplierStatus)
    : "failed_needs_review";

  await supabase.from("supplier_api_logs").insert({
    supplier_id: mapping.supplier_id,
    order_id: order.id,
    action: "purchase",
    endpoint: "/purchase",
    request_payload: requestPayload,
    response_payload: supplierPayload,
    http_status: result.status,
    call_status: result.ok ? "success" : "error",
    supplier_reference: supplierData.orderReference ?? null,
    idempotency_key: idempotencyKey,
    error_message: result.ok ? null : supplierPayload?.message ?? "DataMartGH purchase failed",
    duration_ms: result.durationMs,
  });

  await supabase
    .from("orders")
    .update({
      status: nextStatus,
      supplier_order_reference: supplierData.orderReference ?? order.supplier_order_reference,
      supplier_purchase_id: supplierData.purchaseId ?? order.supplier_purchase_id,
      supplier_transaction_reference:
        supplierData.transactionReference ?? order.supplier_transaction_reference,
      supplier_status: supplierStatus ?? order.supplier_status,
      failure_reason: result.ok ? null : supplierPayload?.message ?? "DataMartGH purchase failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: result.ok ? "supplier.fulfillment_response" : "supplier.fulfillment_failed",
    from_status: "processing",
    to_status: nextStatus,
    message: result.ok
      ? `DataMartGH returned ${supplierStatus ?? "a response"}`
      : "DataMartGH order placement failed",
    metadata: {
      supplier: "datamartgh",
      supplierReference: supplierData.orderReference ?? null,
      httpStatus: result.status,
    },
  });

  return {
    skipped: false,
    orderId: order.id,
    status: nextStatus,
    supplierReference: supplierData.orderReference ?? null,
  };
}
