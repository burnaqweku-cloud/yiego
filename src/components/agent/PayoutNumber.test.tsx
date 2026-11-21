import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: [] as Array<[string, unknown]>, reload: vi.fn(), agent: { momo_number: "0534961986", momo_name: "Joana Aggrey" } as { momo_number: string | null; momo_name: string | null }, payouts: [] as Array<{ status: string }>, error: null as null | { message: string } }));
const thenable = <T,>(value: T): PromiseLike<T> => ({ then: (ok, bad) => Promise.resolve(value).then(ok, bad) });
vi.mock("@/components/agent/AgentShell", () => ({
  p1: () => ({ rpc: (fn: string, args: unknown) => { state.calls.push([fn, args]); return thenable({ data: { changed: true }, error: state.error }); } }),
  useAgent: () => ({ agent: state.agent, payouts: state.payouts, reload: state.reload }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
import PayoutNumber, { payoutDigits, payoutErrorText, payoutFormProblem } from "./PayoutNumber";

describe("payout number rules", () => {
  it("reads numbers the ways people type them", () => {
    expect(payoutDigits("020 403 3601")).toBe("0204033601");
    expect(payoutDigits("+233 20 403 3601")).toBe("0204033601");
    expect(payoutDigits("204033601")).toBe("0204033601");
  });
  it("only allows a real number, typed twice the same, with a name", () => {
    expect(payoutFormProblem("02040336", "02040336", "Joana")).toMatch(/10-digit/);
    expect(payoutFormProblem("0114033601", "0114033601", "Joana")).toMatch(/not on MTN/);
    expect(payoutFormProblem("0204033601", "0204033602", "Joana")).toMatch(/not the same/);
    expect(payoutFormProblem("0204033601", "020 403 3601", "Jo")).toMatch(/name/);
    expect(payoutFormProblem("0204033601", "020 403 3601", "Joana Aggrey")).toBeNull();
  });
  it("explains refusals", () => {
    expect(payoutErrorText("too_many_changes")).toMatch(/too many times/);
    expect(payoutErrorText("bad_momo_number")).toMatch(/not right/);
  });
});

describe("PayoutNumber", () => {
  beforeEach(() => { state.calls.length = 0; state.error = null; state.agent = { momo_number: "0534961986", momo_name: "Joana Aggrey" }; state.payouts = []; toast.success.mockReset(); toast.error.mockReset(); });

  it("shows where earnings go, and changes it after asking", async () => {
    state.payouts = [{ status: "requested" }];
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PayoutNumber />);
    expect(screen.getByText("0534961986")).toBeTruthy();
    expect(screen.getByText(/MTN MoMo · Joana Aggrey/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Change/ }));
    fireEvent.change(screen.getAllByPlaceholderText("0241234567")[0], { target: { value: "0204033601" } });
    expect(screen.getByText("Telecel number")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save number" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getAllByPlaceholderText("0241234567")[1], { target: { value: "020 403 3601" } });
    expect(screen.getByText(/waiting withdrawal will be paid to the new number/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save number" })); });
    expect(ask.mock.calls[0][0]).toContain("0204033601 (Telecel MoMo, Joana Aggrey)");
    expect(state.calls).toContainEqual(["agent_set_payout_number", { p_number: "0204033601", p_name: "Joana Aggrey" }]);
    expect(state.reload).toHaveBeenCalled();
  });

  it("opens the form straight away when there is no number yet, and shows a refusal plainly", async () => {
    state.agent = { momo_number: null, momo_name: null };
    state.error = { message: "too_many_changes" };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PayoutNumber />);
    expect(screen.getByText(/No MoMo number yet/)).toBeTruthy();
    const [a, b] = screen.getAllByPlaceholderText("0241234567");
    fireEvent.change(a, { target: { value: "0244033601" } });
    fireEvent.change(b, { target: { value: "0244033601" } });
    fireEvent.change(screen.getByPlaceholderText(/As it shows/), { target: { value: "Kofi Mensah" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save number" })); });
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/too many times/));
  });
});
