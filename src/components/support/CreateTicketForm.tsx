import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const USER_CATEGORIES = [
  { value: 'payment', label: 'Payment' },
  { value: 'wallet_topup', label: 'Wallet Top-up' },
  { value: 'order_issue', label: 'Order Issue' },
  { value: 'account_login', label: 'Account / Login' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'other', label: 'Other' },
];

const AGENT_CATEGORIES = [
  { value: 'customer_order', label: 'Customer Order Issue' },
  { value: 'wallet_commission', label: 'Wallet / Commission Issue' },
  { value: 'store_activation', label: 'Store Activation / Subscription' },
  { value: 'pricing_markup', label: 'Pricing / Markup Issue' },
  { value: 'other', label: 'Other' },
];

interface CreateTicketFormProps {
  ticketType: 'user' | 'agent';
  agentInfo?: { id: string; store_name: string };
  onSubmit: (data: {
    subject: string;
    category: string;
    message: string;
    related_order_id?: string;
    customer_phone?: string;
    agent_id?: string;
  }) => Promise<any>;
  onBack: () => void;
}

const CreateTicketForm = ({ ticketType, agentInfo, onSubmit, onBack }: CreateTicketFormProps) => {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const categories = ticketType === 'agent' ? AGENT_CATEGORIES : USER_CATEGORIES;
  const showOrderId = ticketType === 'user' ? category === 'order_issue' : ['customer_order'].includes(category);

  const handleSubmit = async () => {
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    if (!category) { toast.error('Category is required'); return; }
    if (!message.trim()) { toast.error('Message is required'); return; }
    if (ticketType === 'agent' && ['customer_order', 'wallet_commission'].includes(category) && !customerPhone.trim()) {
      toast.error('Customer phone is required for this category');
      return;
    }

    setSubmitting(true);
    const result = await onSubmit({
      subject,
      category,
      message,
      related_order_id: orderId || undefined,
      customer_phone: customerPhone || undefined,
      agent_id: agentInfo?.id,
    });
    setSubmitting(false);
    return result;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold">New {ticketType === 'agent' ? 'Agent ' : ''}Support Ticket</h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select category..." /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Subject</Label>
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief description of your issue" className="mt-1" />
        </div>

        {showOrderId && (
          <div>
            <Label>Order ID {ticketType === 'user' ? '(optional)' : ''}</Label>
            <Input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="DS-XXXXXXXX" className="mt-1" />
          </div>
        )}

        {ticketType === 'agent' && ['customer_order', 'wallet_commission'].includes(category) && (
          <div>
            <Label>Customer Phone Number</Label>
            <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="e.g. 0551234567" className="mt-1" />
          </div>
        )}

        {ticketType === 'agent' && agentInfo && (
          <div className="bg-muted/30 rounded-xl p-3 text-xs text-muted-foreground">
            <span className="font-semibold">Agent:</span> {agentInfo.store_name}
          </div>
        )}

        <div>
          <Label>Message</Label>
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Describe your issue in detail..."
            className="mt-1"
            rows={4}
          />
        </div>

        <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? 'Submitting...' : 'Submit Ticket'}
        </Button>
      </div>
    </div>
  );
};

export default CreateTicketForm;
