import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Search, User, ShoppingCart, Wallet, Hash } from 'lucide-react';

interface SearchResult {
  type: 'order' | 'user' | 'transaction';
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

interface AdminSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AdminSearchDialog = ({ open, onOpenChange }: AdminSearchDialogProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const allResults: SearchResult[] = [];

    // Search orders by order_id or recipient_number
    const { data: orders } = await supabase
      .from('orders')
      .select('order_id, recipient_number, network, status, amount_ghs')
      .or(`order_id.ilike.%${q}%,recipient_number.ilike.%${q}%`)
      .limit(5);

    if (orders) {
      orders.forEach((o: any) => {
        allResults.push({
          type: 'order',
          id: o.order_id,
          title: `Order ${o.order_id}`,
          subtitle: `${o.recipient_number} · ${o.network} · ${o.status}`,
          link: '/admin/orders',
        });
      });
    }

    // Search users by name, email, phone, username
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, username')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(5);

    if (users) {
      users.forEach((u: any) => {
        allResults.push({
          type: 'user',
          id: u.id,
          title: u.full_name || u.username || 'User',
          subtitle: `${u.email || ''} · ${u.phone || ''}`.trim().replace(/^·\s*|·\s*$/g, ''),
          link: `/admin/users/${u.id}`,
        });
      });
    }

    // Search transactions by reference
    const { data: transactions } = await supabase
      .from('wallet_transactions')
      .select('id, type, amount_ghs, reference, status')
      .or(`reference.ilike.%${q}%`)
      .limit(3);

    if (transactions) {
      transactions.forEach((t: any) => {
        allResults.push({
          type: 'transaction',
          id: t.id,
          title: `${t.type} · GHS ${Number(t.amount_ghs).toFixed(2)}`,
          subtitle: `Ref: ${t.reference || '—'} · ${t.status}`,
          link: '/admin/wallet',
        });
      });
    }

    setResults(allResults);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const handleSelect = (result: SearchResult) => {
    onOpenChange(false);
    navigate(result.link);
  };

  const iconMap = {
    order: ShoppingCart,
    user: User,
    transaction: Wallet,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b border-border px-4">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders, users, transactions..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 text-sm"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No results found for "{query}"
            </div>
          )}
          {!loading && query.length < 2 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Hash className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Type to search orders, users, phone numbers...
            </div>
          )}
          {results.length > 0 && (
            <div className="p-1">
              {results.map((result) => {
                const Icon = iconMap[result.type];
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-muted/60 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded capitalize shrink-0">
                      {result.type}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminSearchDialog;
