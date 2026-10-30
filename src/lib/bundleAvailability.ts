import type { Phase1NetworkRow, Phase1Product } from "./phase1-api";

export function applyNetworkAvailability(products: Phase1Product[], networks: Phase1NetworkRow[]): Phase1Product[] {
  return products.map((product) => {
    const network = networks.find((row) => row.id === product.network_id);
    if (!network || network.is_paused) {
      return { ...product, is_paused: true, pause_reason: network?.pause_reason || "Unavailable at the moment. Please try again later." };
    }
    return product;
  });
}