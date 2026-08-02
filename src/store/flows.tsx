import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import BuyDataFlow from "@/components/flows/BuyDataFlow";
import AddMoneyFlow from "@/components/flows/AddMoneyFlow";
import { useAuth } from "@/store/auth-context";

/**
 * App-wide flow launcher. openService(id) routes ANY catalog service to its
 * working experience: a bespoke flow, the generic purchase engine, or the
 * relevant page. Every service responds.
 */
interface FlowsValue {
  openBuyData: () => void;
  openAddMoney: () => void;
}

const FlowsContext = createContext<FlowsValue | null>(null);

export function FlowsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [buyOpen, setBuyOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const toAddMoney = () => {
    setBuyOpen(false);
    if (isAuthenticated) setAddOpen(true);
    else navigate("/auth?next=%2Fwallet");
  };

  const openAddMoney = () => {
    if (!isAuthenticated) {
      navigate("/auth?next=%2Fwallet");
      return;
    }
    setAddOpen(true);
  };

  return (
    <FlowsContext.Provider
      value={{
        openBuyData: () => setBuyOpen(true),
        openAddMoney,
      }}
    >
      {children}
      <BuyDataFlow open={buyOpen} onClose={() => setBuyOpen(false)} onAddMoney={toAddMoney} />
      <AddMoneyFlow open={addOpen && isAuthenticated} onClose={() => setAddOpen(false)} />
    </FlowsContext.Provider>
  );
}

export function useFlows(): FlowsValue {
  const ctx = useContext(FlowsContext);
  if (!ctx) throw new Error("useFlows must be used within a FlowsProvider");
  return ctx;
}
