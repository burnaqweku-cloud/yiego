import { describe, expect, it } from "vitest";
import { currentCheckStore, setCheckStore } from "./mtnCheck";
import { setHostSlug } from "./storeHost";

describe("which store a checked number came from", () => {
  it("our own site: no store", () => { expect(currentCheckStore("/check-mtn", false)).toBeNull(); expect(currentCheckStore("/shop", false)).toBeNull(); });
  it("a store page under /s/<slug>", () => { expect(currentCheckStore("/s/big/check-mtn", false)).toBe("big"); expect(currentCheckStore("/s/fawaz-wuniche", true)).toBe("fawaz-wuniche"); });
  it("a store's own address", () => { setHostSlug("rebecca"); expect(currentCheckStore("/check-mtn", true)).toBe("rebecca"); setHostSlug(null); });
  it("an agent's dashboard records the agent's store", () => {
    setCheckStore("oscaria"); expect(currentCheckStore("/agent/check-mtn", false)).toBe("oscaria");
    setCheckStore(null); expect(currentCheckStore("/agent/check-mtn", false)).toBeNull();
  });
});
