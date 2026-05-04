import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, HelpCircle, Clock, CreditCard, Wallet, Store, MoreHorizontal } from 'lucide-react';

interface QuickHelpStepProps {
  ticketType: 'user' | 'agent';
  onProceedToTicket: () => void;
  onBack: () => void;
}

const USER_ISSUES = [
  {
    value: 'order_delay',
    label: 'Order Delay',
    icon: Clock,
    tips: [
      'Data delivery is not always instant — it can take a few minutes to process.',
      'Check your current data balance on your phone to confirm if data was received.',
      'If your order shows "Delivered" but you don\'t see data, try restarting your phone.',
      'Your order is safe. If there\'s a genuine issue, our team will resolve it.',
    ],
  },
  {
    value: 'payment',
    label: 'Payment Issue',
    icon: CreditCard,
    tips: [
      'Only successful payments create orders. If your payment failed, no order was placed.',
      'If you were charged but don\'t see an order, wait 5 minutes and refresh.',
      'For failed payments, the amount is usually refunded within 24–48 hours by your bank.',
      'Try again with a different payment method if the issue persists.',
    ],
  },
  {
    value: 'wallet',
    label: 'Wallet Issue',
    icon: Wallet,
    tips: [
      'Wallet deposits may take a few moments to reflect after payment.',
      'Pull down to refresh or navigate away and back to see your updated balance.',
      'If deposit doesn\'t reflect after 10 minutes, create a support ticket with your payment reference.',
    ],
  },
  {
    value: 'other',
    label: 'Other Issue',
    icon: MoreHorizontal,
    tips: [
      'Check our FAQ section for common questions.',
      'For account issues, try logging out and back in.',
      'If your issue persists, create a support ticket below.',
    ],
  },
];

const AGENT_ISSUES = [
  {
    value: 'order_delay',
    label: 'Customer Order Delay',
    icon: Clock,
    tips: [
      'Orders are processed automatically and may take a few minutes.',
      'Check the order status in your Orders page for real-time updates.',
      'If an order is stuck in "Processing" for over 30 minutes, create a ticket.',
    ],
  },
  {
    value: 'store_activation',
    label: 'Store / Subscription',
    icon: Store,
    tips: [
      'Activation payments are verified automatically. Allow a few minutes after payment.',
      'Subscription renewals happen monthly. Check your subscription status on the dashboard.',
      'If activation doesn\'t reflect, create a ticket with your payment reference.',
    ],
  },
  {
    value: 'wallet',
    label: 'Wallet / Commission',
    icon: Wallet,
    tips: [
      'Commissions are credited after orders are marked as delivered.',
      'Withdrawal requests are processed manually — allow 24–48 hours.',
      'Your available balance only includes confirmed earnings.',
    ],
  },
  {
    value: 'other',
    label: 'Other Issue',
    icon: MoreHorizontal,
    tips: [
      'For pricing/markup issues, check the Pricing page first.',
      'Store settings can be updated from your Store Settings page.',
      'If your issue persists, create a support ticket below.',
    ],
  },
];

const QuickHelpStep = ({ ticketType, onProceedToTicket, onBack }: QuickHelpStepProps) => {
  const [selected, setSelected] = useState<string | null>(null);
  const issues = ticketType === 'agent' ? AGENT_ISSUES : USER_ISSUES;
  const selectedIssue = issues.find(i => i.value === selected);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">Quick Help</h3>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">What's your issue about? We might be able to help right away.</p>

      {/* Issue type selection */}
      <div className="grid grid-cols-2 gap-2">
        {issues.map(issue => (
          <button
            key={issue.value}
            onClick={() => setSelected(issue.value)}
            className={`flex items-center gap-2.5 p-3.5 rounded-xl border transition-all duration-150 text-left ${
              selected === issue.value 
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                : 'border-border bg-card hover:bg-muted/30'
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              selected === issue.value ? 'bg-primary/10' : 'bg-muted'
            }`}>
              <issue.icon className={`w-4 h-4 ${selected === issue.value ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <span className="text-sm font-medium">{issue.label}</span>
          </button>
        ))}
      </div>

      {/* Tips */}
      {selectedIssue && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3" style={{ animation: 'msgSlideIn 0.2s ease-out' }}>
          <h4 className="text-sm font-bold flex items-center gap-2">
            <selectedIssue.icon className="w-4 h-4 text-primary" />
            Quick Solutions
          </h4>
          <ul className="space-y-2">
            {selectedIssue.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-primary font-bold mt-0.5">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          <div className="pt-2 border-t border-border">
            <Button onClick={onProceedToTicket} className="w-full gap-2" variant="default">
              Still need help? Create a ticket
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickHelpStep;
