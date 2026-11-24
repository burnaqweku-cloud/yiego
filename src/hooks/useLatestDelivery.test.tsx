import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useDeliverySpeed", async (real) => ({
  ...await real<typeof import("@/hooks/useDeliverySpeed")>(),
  useDeliverySpeed: () => ({ MTN: { window: "1h", sample: 2, median_minutes: 4 } }),
}));
vi.mock("@/lib/latestDelivery", async (real) => {
  const actual = await real<typeof import("@/lib/latestDelivery")>();
  return { ...actual, loadLatest: async () => actual.readFeed({
    _speed: { enabled: state.enabled },
    MTN: { gb: 1, phone: "024*****51", paid_at: new Date(Date.now() - 300_000).toISOString(), delivered_at: new Date(Date.now() - 60_000).toISOString(), age_seconds: 60 },
  }) };
});
import { useDeliveryNow, useLatestDelivery, useLiveSpeeds } from "./useLatestDelivery";

const quick = { window: "1h" as const, sample: 2, median_minutes: 4 };

describe("delivery-speed switch across display hooks", () => {
  beforeEach(() => { state.enabled = true; });

  it("returns no speed before the switch is known", async () => {
    const { result } = renderHook(() => useLiveSpeeds());
    expect(result.current).toEqual({});
    await waitFor(() => expect(result.current.MTN?.median_minutes).toBe(4));
  });

  it("Off hides speeds even with real delivery measurements available", async () => {
    state.enabled = false;
    const { result } = renderHook(() => useLiveSpeeds());
    await act(async () => {});
    expect(result.current).toEqual({});
  });

  it("Off hides the latest delivery despite a supplied speed", async () => {
    state.enabled = false;
    const { result } = renderHook(() => useLatestDelivery("MTN", quick));
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it("Off hides the slow range despite a supplied speed", async () => {
    state.enabled = false;
    const { result } = renderHook(() => useDeliveryNow("MTN", { ...quick, median_minutes: 90, longest_minutes: 120 }));
    await act(async () => {});
    expect(result.current).toEqual({ latest: null, range: null });
  });
});