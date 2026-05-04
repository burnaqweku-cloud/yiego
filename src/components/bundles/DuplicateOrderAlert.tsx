import { AlertTriangle, MessageSquare } from 'lucide-react';
import { normalizeGhanaWhatsApp } from '@/lib/agent-whatsapp-message';

const YIEGO_WHATSAPP = '233275644195';

interface DuplicateOrderAlertProps {
  existingOrderId?: string;
  /** If provided, routes support to this WhatsApp number (agent store). Otherwise uses main support. */
  agentWhatsApp?: string | null;
}

const DuplicateOrderAlert = ({ existingOrderId, agentWhatsApp }: DuplicateOrderAlertProps) => {
  const orderId = existingOrderId || 'unknown';

  const whatsAppMessage = `Hello, I'm trying to place a data order but the system says I already have an order in progress for this number. Order ID: ${orderId}. Please assist.`;

  const agentNormalized = normalizeGhanaWhatsApp(agentWhatsApp);
  const targetNumber = agentNormalized || YIEGO_WHATSAPP;
  const supportLink = `https://wa.me/${targetNumber}?text=${encodeURIComponent(whatsAppMessage)}`;

  return (
    <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 space-y-1.5">
      <p className="text-xs font-medium text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <span>
          You already have an order in progress for this number.
          {existingOrderId && (
            <> Please wait for order <span className="font-semibold font-mono">{existingOrderId}</span> to complete.</>
          )}
        </span>
      </p>
      <a
        href={supportLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:underline ml-5"
      >
        <MessageSquare className="w-3 h-3" />
        Need help? Contact support
      </a>
    </div>
  );
};

export default DuplicateOrderAlert;
