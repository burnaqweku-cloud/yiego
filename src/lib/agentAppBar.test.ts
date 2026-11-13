import { beforeEach, describe, expect, it } from "vitest";
import { agentAppBarResting, closeAgentAppBar, MAX_CLOSES, REST_MS } from "./agentAppBar";

const T = Date.UTC(2026, 10, 13, 20, 0, 0);

describe("the app strip in the agent dashboard", () => {
  beforeEach(() => localStorage.clear());

  it("shows to an agent who has never closed it", () => {
    expect(agentAppBarResting(T)).toBe(false);
  });
  it("stays away for a day after being closed, then comes back", () => {
    closeAgentAppBar(T);
    expect(agentAppBarResting(T + 60_000)).toBe(true);
    expect(agentAppBarResting(T + REST_MS - 1)).toBe(true);
    expect(agentAppBarResting(T + REST_MS + 1)).toBe(false);
  });
  it("stops for good once it has been closed five times", () => {
    for (let day = 0; day < MAX_CLOSES - 1; day += 1) closeAgentAppBar(T + day * (REST_MS + 1));
    expect(agentAppBarResting(T + MAX_CLOSES * (REST_MS + 1))).toBe(false);
    closeAgentAppBar(T + MAX_CLOSES * (REST_MS + 1));
    expect(agentAppBarResting(T + 400 * REST_MS)).toBe(true);
  });
  it("copes with a damaged note on the phone", () => {
    localStorage.setItem("yg-agent-appbar", "{not json");
    expect(agentAppBarResting(T)).toBe(false);
    localStorage.setItem("yg-agent-appbar", JSON.stringify({ closes: "x", until: null }));
    expect(agentAppBarResting(T)).toBe(false);
  });
});
