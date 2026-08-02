export type WalletTransactionType = "data" | "deposit" | "payment";
export type WalletTransactionGroup = "Today" | "Yesterday" | "This week" | "Earlier";

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  title: string;
  subtitle: string;
  amount: number;
  status: "success" | "pending";
  group?: WalletTransactionGroup;
  ts?: number;
  ref?: string;
}
