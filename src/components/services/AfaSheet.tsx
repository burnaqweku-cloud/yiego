import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";
import AfaForm from "@/components/services/AfaForm";
import { formatGHS } from "@/lib/format";
import type { ServiceContext, ServiceProduct } from "@/lib/services";

/* MTN AFA registration in a pop-up: the same form the Services page shows on its own page.
   Used where the form is opened from a list (the agent dashboard's "Buy for myself"). */
export default function AfaSheet({ product, sms, onClose, onBought, context = {}, walletName = "DataYego wallet" }: { product: ServiceProduct | null; sms: boolean; onClose: () => void; onBought: () => void; context?: ServiceContext; walletName?: string }) {
  if (!product) return <Modal open={false} onClose={onClose} label="AFA registration">{null}</Modal>;
  return (
    <Modal open onClose={onClose} label={product.name}>
      <FlowHeader title={product.name} subtitle={formatGHS(product.price)} onClose={onClose} />
      <div className="px-5 pb-6 pt-5"><AfaForm product={product} sms={sms} onBought={onBought} context={context} walletName={walletName} onDone={onClose} /></div>
    </Modal>
  );
}
