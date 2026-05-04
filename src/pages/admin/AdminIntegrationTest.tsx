import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NETWORKS, type Network } from '@/data/bundles';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Zap, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const AdminIntegrationTest = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testNetwork, setTestNetwork] = useState<Network>('MTN');
  const [testPhone, setTestPhone] = useState('0551234567');
  const [testDataAmount, setTestDataAmount] = useState('1');

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, loading, navigate]);

  if (loading || !user || !isAdmin) return null;

  const handleTestSupplierAPI = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // We'll test by calling our own edge function which will forward to supplier
      // Create a test order first
      const testOrderId = `TEST-${Date.now().toString(36).toUpperCase()}`;
      
      // Insert a test order
      const { data: testOrder, error: insertError } = await supabase
        .from('orders')
        .insert({
          order_id: testOrderId,
          user_id: user!.id,
          recipient_number: testPhone,
          network: testNetwork,
          bundle_size_gb: parseFloat(testDataAmount),
          amount_ghs: 0,
          status: 'Pending',
          payment_method: 'direct',
        })
        .select()
        .single();

      if (insertError) {
        setTestResult({
          success: false,
          error: `Failed to create test order: ${insertError.message}`,
        });
        setTesting(false);
        return;
      }

      // Now call the supplier via our edge function
      const { data, error } = await supabase.functions.invoke('submit-supplier-order', {
        body: { order_id: testOrderId },
      });

      if (error) {
        setTestResult({
          success: false,
          error: `Edge function error: ${error.message}`,
          test_order_id: testOrderId,
        });
      } else {
        setTestResult({
          ...data,
          test_order_id: testOrderId,
        });
      }

      // Fetch updated order to see supplier response
      const { data: updatedOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('order_id', testOrderId)
        .single();

      if (updatedOrder) {
        setTestResult((prev: any) => ({
          ...prev,
          order_status: updatedOrder.status,
          supplier_order_id: updatedOrder.supplier_order_id,
          supplier_status: updatedOrder.supplier_status,
          supplier_message: updatedOrder.supplier_message,
          supplier_amount: updatedOrder.supplier_amount,
          supplier_remaining_balance: updatedOrder.supplier_remaining_balance,
          supplier_raw_response: updatedOrder.supplier_raw_response,
        }));
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: `Unexpected error: ${err.message}`,
      });
    }

    setTesting(false);
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-2xl font-display font-bold">Integration Test</h2>
          <p className="text-muted-foreground text-sm">Test supplier API connection and order delivery</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Supplier API Test
          </h3>
          <p className="text-sm text-muted-foreground">
            This will create a test order and send it to the supplier API. The response will be shown below.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Network</Label>
              <Select value={testNetwork} onValueChange={v => setTestNetwork(v as Network)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="0551234567" className="mt-1" />
            </div>
            <div>
              <Label>Data Amount (GB)</Label>
              <Select value={testDataAmount} onValueChange={setTestDataAmount}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['1','2','3','4','5','6','7','8','10','12'].map(a => (
                    <SelectItem key={a} value={a}>{a}GB</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleTestSupplierAPI} disabled={testing} className="gap-2 w-full sm:w-auto">
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Send Test Order
              </>
            )}
          </Button>

          <p className="text-xs text-destructive font-medium">
            ⚠️ This sends a REAL order to the supplier. Use a valid phone number you control.
          </p>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`rounded-xl border p-6 space-y-3 ${
            testResult.success ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <h3 className="font-display font-semibold">
                {testResult.success ? 'Test Successful' : 'Test Failed'}
              </h3>
            </div>

            <div className="space-y-2 text-sm">
              {testResult.test_order_id && (
                <div className="flex justify-between"><span className="text-muted-foreground">Test Order ID</span><span className="font-mono text-xs">{testResult.test_order_id}</span></div>
              )}
              {testResult.order_status && (
                <div className="flex justify-between"><span className="text-muted-foreground">Order Status</span><span className="font-medium">{testResult.order_status}</span></div>
              )}
              {testResult.supplier_order_id && (
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier Order ID</span><span className="font-mono text-xs">{testResult.supplier_order_id}</span></div>
              )}
              {testResult.supplier_status && (
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier Status</span><span className="font-medium">{testResult.supplier_status}</span></div>
              )}
              {testResult.supplier_message && (
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier Message</span><span>{testResult.supplier_message}</span></div>
              )}
              {testResult.supplier_amount != null && (
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier Amount</span><span>{testResult.supplier_amount}</span></div>
              )}
              {testResult.supplier_remaining_balance != null && (
                <div className="flex justify-between"><span className="text-muted-foreground">Remaining Balance</span><span>{testResult.supplier_remaining_balance}</span></div>
              )}
              {testResult.error && (
                <div className="bg-background rounded-lg p-3 text-destructive text-xs font-mono break-all">
                  {testResult.error}
                </div>
              )}
              {testResult.reason && (
                <div className="bg-background rounded-lg p-3 text-destructive text-xs">
                  {testResult.reason}
                </div>
              )}
              {testResult.supplier_raw_response && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Raw Response</summary>
                  <pre className="text-[10px] mt-1 p-2 bg-background rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                    {testResult.supplier_raw_response}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminIntegrationTest;
