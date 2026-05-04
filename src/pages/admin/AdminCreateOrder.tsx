import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, ArrowRight, PackagePlus, Search, CheckCircle2 } from 'lucide-react';

interface AgentOption { id: string; store_name: string; store_slug: string; status: string; user_id: string; }
interface ProductOption { id: string; network: string; bundle_size_gb: number; price_ghs: number; agent_price_ghs: number | null; description: string; }
interface UserOption { id: string; full_name: string; email: string | null; phone: string; }

const NETWORKS = ['MTN', 'Telecel', 'AirtelTigo'];

const AdminCreateOrder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Step tracking
  const [step, setStep] = useState(0); // 0 = choose type
  const [orderType, setOrderType] = useState<'agent' | 'user' | null>(null);

  // Agent flow state
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentSearch, setAgentSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentOption | null>(null);
  const [agentPricing, setAgentPricing] = useState<Record<string, number>>({});

  // User flow state
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [userSearching, setUserSearching] = useState(false);

  // Shared state
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [network, setNetwork] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ order_id: string; supplier_success: boolean; profit_credited?: boolean; profit_amount?: number; agent_selling_price?: number; agent_base_price?: number } | null>(null);

  // Load agents
  useEffect(() => {
    supabase.from('agents').select('id, store_name, store_slug, status, user_id').eq('status', 'active')
      .then(({ data }) => setAgents((data as AgentOption[]) || []));
  }, []);

  // Load products
  useEffect(() => {
    supabase.from('products').select('id, network, bundle_size_gb, price_ghs, agent_price_ghs, description').eq('active', true).order('bundle_size_gb')
      .then(({ data }) => setProducts((data as ProductOption[]) || []));
  }, []);

  // Load agent pricing when agent selected
  useEffect(() => {
    if (!selectedAgent) { setAgentPricing({}); return; }
    supabase.from('agent_pricing').select('product_id, custom_price').eq('agent_id', selectedAgent.id)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data || []).forEach((p: any) => { if (p.product_id && p.custom_price != null) map[p.product_id] = Number(p.custom_price); });
        setAgentPricing(map);
      });
  }, [selectedAgent]);

  const handleUserSearch = useCallback(async () => {
    if (!userSearch.trim()) return;
    setUserSearching(true);
    const q = userSearch.trim();
    const { data } = await supabase.from('profiles').select('id, full_name, email, phone')
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,username.ilike.%${q}%,id.eq.${q.length === 36 ? q : '00000000-0000-0000-0000-000000000000'}`)
      .limit(20);
    setUsers((data as UserOption[]) || []);
    setUserSearching(false);
  }, [userSearch]);

  const getAgentPrice = (product: ProductOption) => {
    if (agentPricing[product.id]) return agentPricing[product.id];
    return product.agent_price_ghs ?? product.price_ghs;
  };

  const getAgentProfit = (product: ProductOption) => {
    const sellingPrice = getAgentPrice(product);
    const costPrice = product.agent_price_ghs ?? product.price_ghs;
    return Math.max(0, sellingPrice - costPrice);
  };

  const filteredProducts = products.filter(p => p.network === network);

  const filteredAgents = agents.filter(a =>
    !agentSearch || a.store_name.toLowerCase().includes(agentSearch.toLowerCase()) || a.store_slug.toLowerCase().includes(agentSearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-order', {
        body: {
          order_type: orderType,
          agent_id: orderType === 'agent' ? selectedAgent?.id : undefined,
          user_id: orderType === 'user' ? selectedUser?.id : undefined,
          product_id: selectedProduct?.id,
          network,
          bundle_size_gb: selectedProduct?.bundle_size_gb,
          recipient_number: recipientNumber.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      toast.success(`Order ${data.order_id} created successfully`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  // Determine current step label
  const getStepContent = () => {
    if (result) return renderResult();
    if (step === 0) return renderTypeSelection();
    if (orderType === 'agent') return renderAgentFlow();
    if (orderType === 'user') return renderUserFlow();
    return null;
  };

  const renderTypeSelection = () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary ${orderType === 'agent' ? 'ring-2 ring-primary' : ''}`}
        onClick={() => { setOrderType('agent'); setStep(1); }}>
        <CardHeader><CardTitle className="text-base">Agent Store Order</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Create an order through an agent's store with agent pricing and profit.</p></CardContent>
      </Card>
      <Card className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary ${orderType === 'user' ? 'ring-2 ring-primary' : ''}`}
        onClick={() => { setOrderType('user'); setStep(1); }}>
        <CardHeader><CardTitle className="text-base">User Order</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Create a standard order for a registered user.</p></CardContent>
      </Card>
      <Card className="cursor-pointer transition-all hover:ring-2 hover:ring-primary"
        onClick={() => navigate('/admin/orders/bulk')}>
        <CardHeader><CardTitle className="text-base">Bulk Order</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Paste many phone + bundle lines and dispatch through a chosen supplier. No wallet deduction.</p></CardContent>
      </Card>
    </div>
  );

  const renderAgentFlow = () => {
    // Agent sub-steps: 1=select agent, 2=select network, 3=select bundle, 4=enter phone, 5=confirm
    if (step === 1) return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Step 1: Select Agent</h3>
        <Input placeholder="Search agents..." value={agentSearch} onChange={e => setAgentSearch(e.target.value)} />
        <div className="max-h-64 overflow-y-auto space-y-2">
          {filteredAgents.map(a => (
            <div key={a.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedAgent?.id === a.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}`}
              onClick={() => setSelectedAgent(a)}>
              <p className="font-medium text-sm">{a.store_name}</p>
              <p className="text-xs text-muted-foreground">@{a.store_slug}</p>
            </div>
          ))}
          {filteredAgents.length === 0 && <p className="text-sm text-muted-foreground">No agents found</p>}
        </div>
        <Button onClick={() => setStep(2)} disabled={!selectedAgent}>Next <ArrowRight className="w-4 h-4 ml-1" /></Button>
      </div>
    );
    if (step === 2) return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Step 2: Select Network</h3>
        <div className="grid grid-cols-3 gap-3">
          {NETWORKS.map(n => (
            <Card key={n} className={`cursor-pointer text-center p-4 transition-all ${network === n ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
              onClick={() => { setNetwork(n); setSelectedProduct(null); }}>
              <p className="font-medium text-sm">{n}</p>
            </Card>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button onClick={() => setStep(3)} disabled={!network}>Next <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>
    );
    if (step === 3) return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Step 3: Select Bundle</h3>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {filteredProducts.map(p => {
            const price = getAgentPrice(p);
            return (
              <div key={p.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedProduct?.id === p.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}`}
                onClick={() => setSelectedProduct(p)}>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{p.bundle_size_gb} GB</span>
                  <span className="text-sm font-semibold">GHS {price.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>
            );
          })}
          {filteredProducts.length === 0 && <p className="text-sm text-muted-foreground">No bundles for this network</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button onClick={() => setStep(4)} disabled={!selectedProduct}>Next <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>
    );
    if (step === 4) return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Step 4: Recipient Number</h3>
        <div>
          <Label>Phone Number</Label>
          <Input placeholder="0551234567" value={recipientNumber} onChange={e => setRecipientNumber(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button onClick={() => setStep(5)} disabled={!recipientNumber.trim()}>Review <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>
    );
    if (step === 5 && selectedAgent && selectedProduct) {
      const agentPrice = getAgentPrice(selectedProduct);
      const agentProfit = getAgentProfit(selectedProduct);
      return (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Step 5: Confirm Order</h3>
          <Card>
            <CardContent className="pt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Agent</span><span className="font-medium">{selectedAgent.store_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Network</span><span className="font-medium">{network}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Bundle</span><span className="font-medium">{selectedProduct.bundle_size_gb} GB</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span className="font-mono font-medium">{recipientNumber}</span></div>
              <div className="border-t border-border pt-2" />
              <div className="flex justify-between"><span className="text-muted-foreground">Agent Price</span><span className="font-semibold">GHS {agentPrice.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Agent Profit</span><Badge variant="outline" className="text-emerald-600">GHS {agentProfit.toFixed(2)}</Badge></div>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(4)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PackagePlus className="w-4 h-4 mr-1" />}
              Create Order
            </Button>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderUserFlow = () => {
    if (step === 1) return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Step 1: Search User</h3>
        <div className="flex gap-2">
          <Input placeholder="Search by email, name, or user ID..." value={userSearch} onChange={e => setUserSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUserSearch()} />
          <Button variant="outline" onClick={handleUserSearch} disabled={userSearching}>
            {userSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {users.map(u => (
            <div key={u.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedUser?.id === u.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}`}
              onClick={() => setSelectedUser(u)}>
              <p className="font-medium text-sm">{u.full_name}</p>
              <p className="text-xs text-muted-foreground">{u.email || u.phone}</p>
            </div>
          ))}
        </div>
        <Button onClick={() => setStep(2)} disabled={!selectedUser}>Next <ArrowRight className="w-4 h-4 ml-1" /></Button>
      </div>
    );
    if (step === 2) return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Step 2: Select Network</h3>
        <div className="grid grid-cols-3 gap-3">
          {NETWORKS.map(n => (
            <Card key={n} className={`cursor-pointer text-center p-4 transition-all ${network === n ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
              onClick={() => { setNetwork(n); setSelectedProduct(null); }}>
              <p className="font-medium text-sm">{n}</p>
            </Card>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button onClick={() => setStep(3)} disabled={!network}>Next <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>
    );
    if (step === 3) return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Step 3: Select Bundle</h3>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {filteredProducts.map(p => (
            <div key={p.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedProduct?.id === p.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}`}
              onClick={() => setSelectedProduct(p)}>
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm">{p.bundle_size_gb} GB</span>
                <span className="text-sm font-semibold">GHS {p.price_ghs.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{p.description}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button onClick={() => setStep(4)} disabled={!selectedProduct}>Next <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>
    );
    if (step === 4) return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Step 4: Recipient Number</h3>
        <div>
          <Label>Phone Number</Label>
          <Input placeholder="0551234567" value={recipientNumber} onChange={e => setRecipientNumber(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button onClick={() => setStep(5)} disabled={!recipientNumber.trim()}>Review <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>
    );
    if (step === 5 && selectedUser && selectedProduct) return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Step 5: Confirm Order</h3>
        <Card>
          <CardContent className="pt-4 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">User</span><span className="font-medium">{selectedUser.full_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Network</span><span className="font-medium">{network}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bundle</span><span className="font-medium">{selectedProduct.bundle_size_gb} GB</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span className="font-mono font-medium">{recipientNumber}</span></div>
            <div className="border-t border-border pt-2" />
            <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-semibold">GHS {selectedProduct.price_ghs.toFixed(2)}</span></div>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Admin-created order — no payment will be charged.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(4)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PackagePlus className="w-4 h-4 mr-1" />}
            Create Order
          </Button>
        </div>
      </div>
    );
    return null;
  };

  const renderResult = () => (
    <div className="text-center space-y-4 py-6">
      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
      <h3 className="text-lg font-semibold">Order Created</h3>
      <p className="text-sm text-muted-foreground">Order <span className="font-mono font-semibold">{result?.order_id}</span> has been created.</p>
      {result && !result.supplier_success && (
        <p className="text-xs text-yellow-600">⚠ Supplier dispatch may need retry</p>
      )}
      {result && orderType === 'agent' && (
        <Card className="text-left mx-auto max-w-sm">
          <CardContent className="pt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sell Price</span><span className="font-medium">GHS {(result.agent_selling_price ?? 0).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Base Cost</span><span className="font-medium">GHS {(result.agent_base_price ?? 0).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Agent Profit</span><span className="font-semibold text-emerald-600">GHS {(result.profit_amount ?? 0).toFixed(2)}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Profit Credited</span>
              <Badge variant={result.profit_credited ? 'default' : 'destructive'} className={result.profit_credited ? 'bg-emerald-600' : ''}>
                {result.profit_credited ? 'Yes ✓' : 'No — Check logs'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={() => navigate('/admin/orders')}>View Orders</Button>
        <Button onClick={() => { setResult(null); setStep(0); setOrderType(null); setSelectedAgent(null); setSelectedUser(null); setSelectedProduct(null); setNetwork(''); setRecipientNumber(''); }}>
          Create Another
        </Button>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/orders')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Orders
          </Button>
          <h1 className="text-xl font-bold">Create Order</h1>
        </div>

        {!result && step > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={orderType === 'agent' ? 'default' : 'secondary'}>
              {orderType === 'agent' ? 'Agent Store Order' : 'User Order'}
            </Badge>
            <span>Step {step} of 5</span>
          </div>
        )}

        {getStepContent()}
      </div>
    </AdminLayout>
  );
};

export default AdminCreateOrder;
