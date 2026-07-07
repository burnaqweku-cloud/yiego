import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import BuyDataFlow from "@/components/flows/BuyDataFlow";
import AddMoneyFlow from "@/components/flows/AddMoneyFlow";
import WithdrawFlow from "@/components/flows/WithdrawFlow";
import CreateLinkFlow from "@/components/flows/CreateLinkFlow";
import BetConverterFlow from "@/components/flows/BetConverterFlow";
import PurchaseFlow from "@/components/flows/PurchaseFlow";
import { flowFor, type ServiceFlowConfig } from "@/data/serviceFlows";
import { SERVICES } from "@/data/services";
import { comingSoonToast } from "@/lib/toasts";

/**
 * App-wide flow launcher. openService(id) routes ANY catalog service to its
 * working experience: a bespoke flow, the generic purchase engine, or the
 * relevant page. Every service responds.
 */
interface FlowsValue {
  openBuyData: () => void;
  openAddMoney: () => void;
  openWithdraw: () => void;
  openCreateLink: () => void;
  openService: (serviceId: string) => void;
}

const FlowsContext = createContext<FlowsValue | null>(null);

export function FlowsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [buyOpen, setBuyOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [betOpen, setBetOpen] = useState(false);
  const [purchase, setPurchase] = useState<ServiceFlowConfig | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const openService = (serviceId: string) => {
    switch (serviceId) {
      case "data":
        setBuyOpen(true);
        return;
      case "payment-links":
        setLinkOpen(true);
        return;
      case "payouts":
        setWithdrawOpen(true);
        return;
      case "bet-converter":
        setBetOpen(true);
        return;
      case "checkout-pages":
      case "invoices":
      case "developer-api":
        // These live on the Payments pillar — take the user there.
        navigate("/payments");
        return;
      default: {
        const config = flowFor(serviceId);
        if (config) {
          setPurchase(config);
          setPurchaseOpen(true);
          return;
        }
        const name = SERVICES.find((s) => s.id === serviceId)?.name ?? "This service";
        comingSoonToast(name);
      }
    }
  };

  const toAddMoney = () => {
    setBuyOpen(false);
    setPurchaseOpen(false);
    setAddOpen(true);
  };

  return (
    <FlowsContext.Provider
      value={{
        openBuyData: () => setBuyOpen(true),
        openAddMoney: () => setAddOpen(true),
        openWithdraw: () => setWithdrawOpen(true),
        openCreateLink: () => setLinkOpen(true),
        openService,
      }}
    >
      {children}
      <BuyDataFlow open={buyOpen} onClose={() => setBuyOpen(false)} onAddMoney={toAddMoney} />
      <AddMoneyFlow open={addOpen} onClose={() => setAddOpen(false)} />
      <WithdrawFlow open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
      <CreateLinkFlow open={linkOpen} onClose={() => setLinkOpen(false)} />
      <BetConverterFlow open={betOpen} onClose={() => setBetOpen(false)} />
      <PurchaseFlow
        config={purchase}
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        onAddMoney={toAddMoney}
      />
    </FlowsContext.Provider>
  );
}

export function useFlows(): FlowsValue {
  const ctx = useContext(FlowsContext);
  if (!ctx) throw new Error("useFlows must be used within a FlowsProvider");
  return ctx;
}
