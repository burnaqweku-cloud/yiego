import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  ArrowLeft, Copy, RefreshCw, ShoppingBag, Wallet,
  Loader2, RotateCcw
} from 'lucide-react';

const statusColors: Record<string, string> = {
  Processing: 'bg-primary/10 text-primary border-primary/20',
  Delivered: 'bg-success/10 text-success border-success/20',
  Failed: 'bg-destructive/10 text-destructive border-destructive/20',
  Paid: 'bg-info/10 text-info border-info/20',
};

const AgentWholesaleOrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const fetchOrder = async () => {
    if (!user || !orderId) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .eq('user_id', user.id)
      .eq('is_wholesale', true)
      .maybeSingle();
    setOrder(data);
    setLoading(false);
  };

  useEffect(() => { fetchOrder(); }, [user, orderId]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  const handleRetry = async () => {
    if (!orderId) return;
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-wholesale-order', {
        body: { action: 'retry_order', order_id: orderId },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success('Order retried successfully');
        fetchOrder();
      } else {
        toast.error('Retry failed. Please try again or contact support.');
        fetchOrder();
      }
    } catch (err: any) {
      toast.error('Retry failed. Please try again later.');
    } finally {
      setRetrying(false);
    }
  };

  const handleReorder = () => {
    if (!order) return;
    navigate('/agent/bulk-purchase');
  };

  if (loading) {
    return (
      <AgentGate>
        <AgentLayout>
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </AgentLayout>
      </AgentGate>
    );
  }

  if (!order) {
    return (
      <AgentGate>
        <AgentLayout>
          <div className="text-center py-12">
            <p className="text-muted-foreground">Order not found</p>
            <Button variant="ghost" className="mt-4" onClick={() => navigate('/agent/bulk-orders')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to History
            </Button>
          </div>
        </AgentLayout>
      </AgentGate>
    );
  }

  return (
    <AgentGate>
      <AgentLayout>
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/agent/bulk-orders')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold font-mono">{order.order_id}</h1>
              <p className="text-xs text-muted-foreground">Bulk Order</p>
            </div>
          </div>

          {/* Info badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs gap-1">
              <ShoppingBag className="w-3 h-3" /> Bulk Order
            </Badge>
            <Badge variant="secondary" className="text-xs gap-1">
              <Wallet className="w-3 h-3" /> Paid from Wallet
            </Badge>
          </div>

          {/* Status Card */}
          <Card className={`border ${statusColors[order.status] || ''}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="font-bold text-lg">{order.status}</p>
                {order.status === 'Failed' && (
                  <p className="text-xs text-destructive mt-1">We could not complete this order. Please try again or contact support.</p>
                )}
              </div>
              <Badge className={`${statusColors[order.status] || 'bg-muted'} text-sm px-3 py-1`}>
                {order.status}
              </Badge>
            </CardContent>
          </Card>

          {/* Order Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network</span>
                <span className="font-medium">{order.network}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bundle</span>
                <span className="font-medium">{order.bundle_size_gb}GB</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Recipient</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-medium">{order.recipient_number}</span>
                  <button onClick={() => handleCopy(order.recipient_number)} className="p-1 rounded hover:bg-muted transition-colors">
                    <Copy className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent Price</span>
                <span className="font-bold">GHS {Number(order.wholesale_unit_price || order.amount_ghs).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-xs">{new Date(order.created_at).toLocaleString()}</span>
              </div>
              {order.agent_note && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Note</span>
                  <span>{order.agent_note}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            {order.status === 'Failed' && (
              <Button variant="outline" className="flex-1 gap-1.5" onClick={handleRetry} disabled={retrying}>
                {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Try Again
              </Button>
            )}
            <Button variant="ghost" className="flex-1 gap-1.5" onClick={() => handleCopy(order.recipient_number)}>
              <Copy className="w-4 h-4" /> Copy Recipient
            </Button>
            <Button variant="ghost" className="flex-1 gap-1.5" onClick={handleReorder}>
              <RefreshCw className="w-4 h-4" /> Reorder
            </Button>
          </div>
        </div>
      </AgentLayout>
    </AgentGate>
  );
};

export default AgentWholesaleOrderDetail;
