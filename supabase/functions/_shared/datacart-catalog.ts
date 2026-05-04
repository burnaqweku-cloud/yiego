export const DATACART_BASE_URL = "https://lsqzwiobycznkmaeegrj.supabase.co/functions/v1/api-gateway";

const NETWORK_NAME_MAP: Record<string, string> = {
  mtn: "MTN",
  telecel: "Telecel",
  vodafone: "Telecel",
  tel: "Telecel",
  airteltigo: "AirtelTigo",
  airtel: "AirtelTigo",
  tigo: "AirtelTigo",
  at: "AirtelTigo",
  atg: "AirtelTigo",
};

const INACTIVE_PROVIDER_STATUSES = new Set([
  "inactive",
  "disabled",
  "down",
  "archived",
  "paused",
]);

const UUIDISH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DataCartResolvedMapping {
  networkId: string;
  planId: string;
  internalNetwork: string;
  sizeGb: number;
  providerNetworkName: string | null;
  providerPlanName: string | null;
  providerPrice: number | null;
  source: "db" | "catalog_auto_sync";
}

export interface DataCartResolveResult {
  ok: boolean;
  code?: string;
  error?: string;
  mapping?: DataCartResolvedMapping;
}

interface NormalizedDataCartNetwork {
  providerNetworkId: string;
  internalNetwork: string;
  providerNetworkName: string | null;
  providerSlug: string | null;
  isActive: boolean;
  raw: Record<string, unknown>;
}

interface NormalizedDataCartPlan {
  providerPlanId: string;
  providerPlanName: string | null;
  providerNetworkId: string;
  providerNetworkName: string | null;
  internalNetwork: string;
  sizeGb: number;
  providerPrice: number | null;
  isActive: boolean;
  raw: Record<string, unknown>;
}

interface DataCartCatalog {
  networks: NormalizedDataCartNetwork[];
  plans: NormalizedDataCartPlan[];
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeKey(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function normalizeInternalNetwork(value: unknown): string | null {
  const key = normalizeKey(value);
  return key ? NETWORK_NAME_MAP[key] || null : null;
}

function isProviderActive(status: unknown): boolean {
  const key = normalizeKey(status);
  return key ? !INACTIVE_PROVIDER_STATUSES.has(key) : true;
}

function isUuidLike(value: unknown): boolean {
  return typeof value === "string" && UUIDISH_RE.test(value.trim());
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseDataCartSizeToGb(primary: unknown, fallback?: unknown): number | null {
  const candidates = [primary, fallback];

  for (const candidate of candidates) {
    const direct = toNumber(candidate);
    if (direct != null && direct > 0) return direct;

    const text = String(candidate || "").trim();
    if (!text) continue;

    const gbMatch = text.match(/(\d+(?:\.\d+)?)\s*gb/i);
    if (gbMatch) {
      const size = Number(gbMatch[1]);
      if (Number.isFinite(size) && size > 0) return size;
    }

    const mbMatch = text.match(/(\d+(?:\.\d+)?)\s*mb/i);
    if (mbMatch) {
      const size = Number(mbMatch[1]) / 1000;
      if (Number.isFinite(size) && size > 0) return Number(size.toFixed(3));
    }
  }

  return null;
}

function formatHttpError(status: number, payload: any, fallback: string): string {
  const message = payload?.message || payload?.error || payload?.details?.message;
  return message ? String(message) : `${fallback} (HTTP ${status})`;
}

function getCatalogKey(internalNetwork: string, sizeGb: number): string {
  return `${internalNetwork}::${Number(sizeGb).toFixed(3)}`;
}

async function fetchJson(path: string) {
  const apiKey = Deno.env.get("DATACART_API_KEY");
  if (!apiKey) {
    throw new Error("DataCart API key not configured");
  }

  const response = await fetch(`${DATACART_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(formatHttpError(response.status, payload, `DataCart request failed for ${path}`));
  }

  return payload;
}

export async function fetchDataCartCatalog(): Promise<DataCartCatalog> {
  const [networkPayload, planPayload] = await Promise.all([
    fetchJson("/v1/networks"),
    fetchJson("/v1/plans"),
  ]);

  const rawNetworks = Array.isArray(networkPayload?.data)
    ? networkPayload.data
    : Array.isArray(networkPayload)
      ? networkPayload
      : [];

  const networks: NormalizedDataCartNetwork[] = rawNetworks
    .map((item: any) => {
      const raw = toRecord(item);
      if (!raw) return null;

      const providerNetworkId = String(raw.id || raw.network_id || raw.uuid || "").trim();
      const providerNetworkName = String(raw.name || raw.network_name || "").trim() || null;
      const providerSlug = String(raw.slug || raw.code || "").trim() || null;
      const internalNetwork = normalizeInternalNetwork(providerNetworkName || providerSlug || raw.code);

      if (!providerNetworkId || !internalNetwork) return null;

      return {
        providerNetworkId,
        internalNetwork,
        providerNetworkName,
        providerSlug,
        isActive: isProviderActive(raw.status),
        raw,
      };
    })
    .filter(Boolean) as NormalizedDataCartNetwork[];

  const networksById = new Map(networks.map((network) => [network.providerNetworkId, network]));

  const rawPlans = Array.isArray(planPayload?.data)
    ? planPayload.data
    : Array.isArray(planPayload)
      ? planPayload
      : [];

  const plans: NormalizedDataCartPlan[] = rawPlans
    .map((item: any) => {
      const raw = toRecord(item);
      if (!raw) return null;

      const nestedNetwork = toRecord(raw.network);
      const providerPlanId = String(raw.id || raw.plan_id || raw.uuid || "").trim();
      const providerPlanName = String(raw.name || raw.plan_name || "").trim() || null;
      const providerNetworkId = String(
        raw.network_id || nestedNetwork?.id || nestedNetwork?.network_id || ""
      ).trim();
      const networkFromId = providerNetworkId ? networksById.get(providerNetworkId) || null : null;
      const providerNetworkName = String(
        raw.network_name || nestedNetwork?.name || networkFromId?.providerNetworkName || ""
      ).trim() || null;
      const internalNetwork = normalizeInternalNetwork(
        raw.network_slug || nestedNetwork?.slug || providerNetworkName || raw.network || networkFromId?.internalNetwork
      ) || networkFromId?.internalNetwork || null;
      const sizeGb = parseDataCartSizeToGb(
        raw.size || raw.size_gb || raw.capacity_gb || raw.data_amount,
        providerPlanName
      );

      if (!providerPlanId || !providerNetworkId || !internalNetwork || !sizeGb) return null;

      return {
        providerPlanId,
        providerPlanName,
        providerNetworkId,
        providerNetworkName,
        internalNetwork,
        sizeGb,
        providerPrice: toNumber(raw.price),
        isActive: isProviderActive(raw.status) && isProviderActive(nestedNetwork?.status ?? networkFromId?.raw.status),
        raw,
      };
    })
    .filter(Boolean) as NormalizedDataCartPlan[];

  return { networks, plans };
}

export async function syncDataCartMappings(supabase: any) {
  const catalog = await fetchDataCartCatalog();
  const now = new Date().toISOString();
  const liveKeys = new Set<string>();
  let upserted = 0;
  let deactivated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const plan of catalog.plans) {
    liveKeys.add(getCatalogKey(plan.internalNetwork, plan.sizeGb));

    const { error } = await supabase
      .from("supplier_plan_mappings")
      .upsert({
        supplier_code: "DATACART",
        internal_network: plan.internalNetwork,
        provider_network_id: plan.providerNetworkId,
        provider_network_name: plan.providerNetworkName,
        size_gb: plan.sizeGb,
        provider_plan_id: plan.providerPlanId,
        provider_plan_name: plan.providerPlanName,
        provider_price: plan.providerPrice,
        is_active: plan.isActive,
        updated_at: now,
      }, { onConflict: "supplier_code,internal_network,size_gb" });

    if (error) {
      errors.push(`Upsert failed for ${plan.internalNetwork} ${plan.sizeGb}GB: ${error.message}`);
      skipped++;
      continue;
    }

    upserted++;
  }

  const { data: existingMappings, error: existingError } = await supabase
    .from("supplier_plan_mappings")
    .select("id, internal_network, size_gb, is_active")
    .eq("supplier_code", "DATACART");

  if (existingError) {
    errors.push(`Failed to inspect existing DataCart mappings: ${existingError.message}`);
  } else {
    for (const row of existingMappings || []) {
      const key = getCatalogKey(String(row.internal_network), Number(row.size_gb));
      if (!liveKeys.has(key) && row.is_active !== false) {
        const { error } = await supabase
          .from("supplier_plan_mappings")
          .update({ is_active: false, updated_at: now })
          .eq("id", row.id);

        if (error) {
          errors.push(`Failed to deactivate stale mapping ${row.internal_network} ${row.size_gb}GB: ${error.message}`);
        } else {
          deactivated++;
        }
      }
    }
  }

  return {
    ok: true,
    networks_found: catalog.networks.length,
    plans_found: catalog.plans.length,
    upserted,
    skipped,
    deactivated,
    errors: errors.length ? errors : undefined,
    mappings: catalog.plans,
  };
}

function almostEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001;
}

export async function resolveDataCartProviderMapping(
  supabase: any,
  params: { network: string; sizeGb: number; productId?: string | null }
): Promise<DataCartResolveResult> {
  const internalNetwork = normalizeInternalNetwork(params.network) || String(params.network || "").trim();
  const sizeGb = Number(params.sizeGb);

  if (!internalNetwork) {
    return {
      ok: false,
      code: "MISSING_PROVIDER_NETWORK_MAPPING",
      error: "Missing DataCart provider network mapping",
    };
  }

  if (!Number.isFinite(sizeGb) || sizeGb <= 0) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_PLAN_SIZE",
      error: `Invalid DataCart bundle size for ${internalNetwork}`,
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("supplier_plan_mappings")
    .select("provider_network_id, provider_plan_id, provider_network_name, provider_plan_name, provider_price, is_active")
    .eq("supplier_code", "DATACART")
    .eq("internal_network", internalNetwork)
    .eq("size_gb", sizeGb)
    .maybeSingle();

  if (
    !existingError
    && existing?.is_active !== false
    && isUuidLike(existing?.provider_network_id)
    && isUuidLike(existing?.provider_plan_id)
  ) {
    return {
      ok: true,
      mapping: {
        networkId: String(existing.provider_network_id),
        planId: String(existing.provider_plan_id),
        internalNetwork,
        sizeGb,
        providerNetworkName: existing.provider_network_name || null,
        providerPlanName: existing.provider_plan_name || null,
        providerPrice: existing.provider_price != null ? Number(existing.provider_price) : null,
        source: "db",
      },
    };
  }

  let catalog;
  try {
    catalog = await syncDataCartMappings(supabase);
  } catch (error) {
    return {
      ok: false,
      code: "DATACART_CATALOG_SYNC_FAILED",
      error: `Failed to auto-sync DataCart catalog: ${String(error)}`,
    };
  }

  const activeNetworks = new Set(
    (catalog.mappings as NormalizedDataCartPlan[])
      .filter((plan) => plan.isActive)
      .map((plan) => plan.internalNetwork)
  );

  if (!activeNetworks.has(internalNetwork)) {
    return {
      ok: false,
      code: "DATACART_NETWORK_UNAVAILABLE",
      error: `DataCart network ${internalNetwork} is currently unavailable`,
    };
  }

  const candidates = (catalog.mappings as NormalizedDataCartPlan[]).filter((plan) => (
    plan.isActive
    && plan.internalNetwork === internalNetwork
    && almostEqual(plan.sizeGb, sizeGb)
  ));

  if (candidates.length === 1) {
    const match = candidates[0];
    return {
      ok: true,
      mapping: {
        networkId: match.providerNetworkId,
        planId: match.providerPlanId,
        internalNetwork,
        sizeGb,
        providerNetworkName: match.providerNetworkName,
        providerPlanName: match.providerPlanName,
        providerPrice: match.providerPrice,
        source: "catalog_auto_sync",
      },
    };
  }

  if (candidates.length > 1) {
    return {
      ok: false,
      code: "AMBIGUOUS_PROVIDER_PLAN_MAPPING",
      error: `Multiple DataCart plans matched ${internalNetwork} ${sizeGb}GB. Review supplier mappings before dispatching.`,
    };
  }

  const availableSizes = [...new Set(
    (catalog.mappings as NormalizedDataCartPlan[])
      .filter((plan) => plan.isActive && plan.internalNetwork === internalNetwork)
      .map((plan) => `${plan.sizeGb}GB`)
  )].sort((left, right) => Number(left.replace("GB", "")) - Number(right.replace("GB", "")));

  return {
    ok: false,
    code: "MISSING_PROVIDER_PLAN_MAPPING",
    error: availableSizes.length > 0
      ? `Missing DataCart provider plan mapping for ${internalNetwork} ${sizeGb}GB. Available synced sizes: ${availableSizes.join(", ")}`
      : `Missing DataCart provider plan mapping for ${internalNetwork} ${sizeGb}GB`,
  };
}