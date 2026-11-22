import { describe, expect, it } from "vitest";
import { agentPriceRows, sizeLabel } from "./agentPriceList";
import type { Phase1NetworkRow, Phase1Product } from "./phase1-api";

const nets: Phase1NetworkRow[] = [
  { id: "n1", code: "mtn", name: "MTN", is_paused: false, pause_reason: null },
  { id: "n2", code: "airteltigo", name: "AirtelTigo", is_paused: false, pause_reason: null },
];
const prod = (o: Partial<Phase1Product>): Phase1Product => ({ id: Math.random().toString(), app_product_code: null, name: "x", validity: null, customer_price: 0, ...o });

describe("agentPriceRows", () => {
  const rows = agentPriceRows([
    prod({ network_id: "n1", capacity_gb: 10, agent_price: 41, customer_price: 43 }),
    prod({ network_id: "n1", capacity_gb: 1, agent_price: 4, customer_price: 4.1 }),
    prod({ network_id: "n2", capacity_gb: "2", agent_price: 7.6, customer_price: 8.14, is_paused: true }),
    prod({ network_id: "n1", capacity_gb: 3, agent_price: 13.5, customer_price: 13.5 }),
    prod({ network_id: "n1", capacity_gb: 4, agent_price: null, customer_price: 18 }),
    prod({ network_id: "nX", capacity_gb: 5, agent_price: 1, customer_price: 2 }),
  ], nets);
  it("lists every bundle cheaper for agents, smallest first, with what the agent keeps", () => {
    expect(rows.filter((r) => r.network === "mtn").map((r) => [r.size, r.agent, r.pub, r.keep])).toEqual([["1GB", 4, 4.1, 0.1], ["10GB", 41, 43, 2]]);
  });
  it("maps AirtelTigo to its tab and keeps a paused bundle, marked", () => {
    expect(rows.find((r) => r.network === "at")).toMatchObject({ size: "2GB", keep: 0.54, paused: true });
  });
  it("leaves out bundles with no agent price, no saving or an unknown network", () => expect(rows).toHaveLength(3));
  it("labels sizes", () => { expect(sizeLabel(1)).toBe("1GB"); expect(sizeLabel(1.5)).toBe("1.5GB"); expect(sizeLabel(0.5)).toBe("500MB"); });
});
