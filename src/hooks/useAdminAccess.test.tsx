import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminAccess } from "./useAdminAccess";

const state = vi.hoisted(() => ({
  auth: { user: { id: "owner" }, session: { access_token: "test-token" }, loading: false } as {
    user: { id: string } | null; session: { access_token: string } | null; loading: boolean;
  },
  rpc: vi.fn(),
}));
vi.mock("@/store/auth-context", () => ({ useAuth: () => state.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { schema: () => ({ rpc: state.rpc }) } }));
const allowed = { is_admin: true, aal: "aal2", has_factor: true, role: "master", can_act: true };
function deferred() {
  let resolve: (value: { data: unknown; error: unknown }) => void = () => {};
  const promise = new Promise<{ data: unknown; error: unknown }>((done) => { resolve = done; });
  return { promise, resolve };
}
describe("admin access on app return", () => {
  beforeEach(() => {
    state.auth = { user: { id: "owner" }, session: { access_token: "test-token" }, loading: false };
    state.rpc.mockReset().mockResolvedValue({ data: allowed, error: null });
  });
  it("does not restart access loading for the same resumed session", async () => {
    const { result, rerender } = renderHook(() => useAdminAccess());
    await waitFor(() => expect(result.current.canAct).toBe(true));
    state.auth = { ...state.auth, user: { id: "owner" }, session: { access_token: "test-token" } };
    rerender();
    expect(result.current.loading).toBe(false);
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it("checks a changed token in the background without blanking the page", async () => {
    const { result, rerender } = renderHook(() => useAdminAccess());
    await waitFor(() => expect(result.current.canAct).toBe(true));
    const pending = deferred(); state.rpc.mockReturnValueOnce(pending.promise);
    state.auth = { ...state.auth, session: { access_token: "new-test-token" } }; rerender();
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.canAct).toBe(false);
    await act(async () => pending.resolve({ data: { ...allowed, aal: "aal1" }, error: null }));
    expect(result.current.needsMfa).toBe(true);
  });
  it("never exposes the previous account's access while checking another account", async () => {
    const { result, rerender } = renderHook(() => useAdminAccess());
    await waitFor(() => expect(result.current.canAct).toBe(true));
    const pending = deferred(); state.rpc.mockReturnValueOnce(pending.promise);
    state.auth = { ...state.auth, user: { id: "other" }, session: { access_token: "other-test-token" } }; rerender();
    expect(result.current.loading).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.canAct).toBe(false);
    await act(async () => pending.resolve({ data: { ...allowed, is_admin: false, can_act: false }, error: null }));
    expect(result.current.isAdmin).toBe(false);
  });
  it("discards a previous account's delayed response after sign-out", async () => {
    const pending = deferred(); state.rpc.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(() => useAdminAccess());
    state.auth = { user: null, session: null, loading: false }; rerender();
    await act(async () => pending.resolve({ data: allowed, error: null }));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.canAct).toBe(false);
    expect(result.current.loading).toBe(false);
  });
  it("fails closed when a background access request throws", async () => {
    const { result } = renderHook(() => useAdminAccess());
    await waitFor(() => expect(result.current.canAct).toBe(true));
    state.rpc.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.canAct).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});