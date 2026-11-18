import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const calls: Array<[string, unknown]> = [];
let reply: unknown[] = [];
// Thenable-only stand-ins, like real supabase-js calls (no .catch/.finally).
const thenable = (value: unknown) => ({ then: (ok: (v: unknown) => unknown) => Promise.resolve(ok(value)) });
vi.mock("@/components/agent/AgentShell", () => ({
  p1: () => ({ rpc: (fn: string, args: unknown) => { calls.push([fn, args]); return thenable(fn === "my_dashboard_messages" ? { data: reply } : { data: null }); } }),
}));
import DashboardMessages from "./DashboardMessages";

const msg = (id: string, title: string, link_url: string | null = null, link_label: string | null = null) => ({ id, title, body: `${title} body`, kind: "update", link_url, link_label, starts_at: new Date().toISOString() });
const show = async () => { await act(async () => { render(<MemoryRouter><DashboardMessages /></MemoryRouter>); }); };

describe("DashboardMessages", () => {
  beforeEach(() => { calls.length = 0; });

  it("shows nothing when there are no messages", async () => {
    reply = [];
    await show();
    expect(screen.queryByLabelText("Message from DataYego")).toBeNull();
  });

  it("shows the newest message with its button and steps through the rest", async () => {
    reply = [msg("a", "Get your own domain", "/agent/domain/buy", "Get your domain"), msg("b", "New prices")];
    await show();
    expect(screen.getByText("Get your own domain")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Get your domain" }).getAttribute("href")).toBe("/agent/domain/buy");
    expect(screen.getByText("1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Next message"));
    expect(screen.getByText("New prices")).toBeTruthy();
  });

  it("Got it puts the message away and tells the database", async () => {
    reply = [msg("a", "Only one")];
    await show();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Got it" })); });
    expect(screen.queryByText("Only one")).toBeNull();
    expect(calls).toContainEqual(["dismiss_dashboard_message", { p_id: "a" }]);
  });

  it("opens other sites in a new tab", async () => {
    reply = [msg("w", "Join the channel", "https://whatsapp.com/channel/x", "Join")];
    await show();
    const a = screen.getByRole("link", { name: /Join/ });
    expect(a.getAttribute("target")).toBe("_blank");
  });
});
