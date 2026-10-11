import { describe, expect, it } from "vitest";
import { networkForNumber } from "./numberNetwork";

describe("networkForNumber", () => {
  it("reads the network off the prefix", () => {
    expect(networkForNumber("0245986568")).toBe("mtn");
    expect(networkForNumber("0201234567")).toBe("telecel");
    expect(networkForNumber("0261234567")).toBe("at");
  });
  it("accepts +233 style and rejects bad input", () => {
    expect(networkForNumber("233245986568")).toBe("mtn");
    expect(networkForNumber("024598")).toBeNull();
    expect(networkForNumber("0991234567")).toBeNull();
  });
});
