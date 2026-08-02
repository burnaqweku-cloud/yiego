export type NetworkId = "mtn" | "telecel" | "at";

export interface Network {
  id: NetworkId;
  name: string;
  /** Brand colour — used only as a small accent dot/ring on its card. */
  color: string;
}

export const NETWORKS: Network[] = [
  { id: "mtn", name: "MTN", color: "#FFCB05" },
  { id: "telecel", name: "Telecel", color: "#E4002B" },
  { id: "at", name: "AirtelTigo", color: "#0A72BD" },
];

export interface Bundle {
  id: string;
  size: string;
  validity: string;
  price: number;
  tag?: "Popular" | "Best value";
}

export const TOPUP_AMOUNTS = [20, 50, 100, 200, 500];
