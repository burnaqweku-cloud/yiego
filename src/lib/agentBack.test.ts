import { describe, expect, it } from "vitest";
import { agentBackMove } from "./agentBack";

describe("Back on the agent pay screen", () => {
  it("returns to the page the person tapped from", () => {
    expect(agentBackMove(3, false)).toBe("previous");
    expect(agentBackMove(1, false)).toBe("previous");
  });
  it("goes home straight after signing in", () => expect(agentBackMove(2, true)).toBe("home"));
  it("goes home when the screen was the first page of the visit", () => {
    expect(agentBackMove(0, false)).toBe("home");
    expect(agentBackMove(undefined, false)).toBe("home");
    expect(agentBackMove("x", false)).toBe("home");
  });
});
