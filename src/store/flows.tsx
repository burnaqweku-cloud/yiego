import { createContext, useContext, useState, type ReactNode } from "react";
import BuyDataFlow from "@/components/flows/BuyDataFlow";
import AddMoneyFlow from "@/components/flows/AddMoneyFlow";

/** App-wide launcher for the interactive money flows. */
interface FlowsValue {
  openBuyData: () => void;
  openAddMoney: () => void;
}

const FlowsContext = createContext<FlowsValue | null>(null);

export function FlowsProvider({ children }: { children: ReactNode }) {
  const [buyOpen, setBuyOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <FlowsContext.Provider
      value={{
        openBuyData: () => setBuyOpen(true),
        openAddMoney: () => setAddOpen(true),
      }}
    >
      {children}
      <BuyDataFlow
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        onAddMoney={() => {
          setBuyOpen(false);
          setAddOpen(true);
        }}
      />
      <AddMoneyFlow open={addOpen} onClose={() => setAddOpen(false)} />
    </FlowsContext.Provider>
  );
}

export function useFlows(): FlowsValue {
  const ctx = useContext(FlowsContext);
  if (!ctx) throw new Error("useFlows must be used within a FlowsProvider");
  return ctx;
}
