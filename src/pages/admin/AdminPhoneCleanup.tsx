import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

interface DuplicateGroup {
  phone_e164: string;
  profiles: { id: string; full_name: string; email: string | null; phone: string; username: string | null; created_at: string }[];
}

const AdminPhoneCleanup = () => {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [constraintReady, setConstraintReady] = useState(false);

  const load = async () => {
    setLoading(true);
    // Find duplicate phone_e164 values
    const { data, error } = await supabase.rpc('check_username_available', { p_username: '__noop__' }); // dummy to warm up
    
    // Query profiles with phone_e164, group duplicates
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, username, created_at, phone_e164')
      .not('phone_e164', 'is', null)
      .order('created_at', { ascending: true });

    if (profiles) {
      const phoneMap: Record<string, any[]> = {};
      (profiles as any[]).forEach(p => {
        const key = p.phone_e164;
        if (!key) return;
        if (!phoneMap[key]) phoneMap[key] = [];
        phoneMap[key].push(p);
      });

      const dupes = Object.entries(phoneMap)
        .filter(([_, items]) => items.length > 1)
        .map(([phone_e164, items]) => ({ phone_e164, profiles: items }));

      setGroups(dupes);
      setConstraintReady(dupes.length === 0);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const clearPhone = async (userId: string, groupPhone: string) => {
    setActionLoading(userId);
    await supabase.from('profiles').update({ phone: '', phone_e164: null } as any).eq('id', userId);
    toast.success('Phone cleared from duplicate account');
    await load();
    setActionLoading(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold flex items-center gap-2">
              <Phone className="w-5 h-5" /> Phone Cleanup
            </h1>
            <p className="text-sm text-muted-foreground">Resolve duplicate phone numbers before enabling uniqueness constraint</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>

        {/* Status */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            {constraintReady ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-sm font-bold text-green-400">No duplicates found</p>
                  <p className="text-xs text-muted-foreground">UNIQUE constraint on phone_e164 can be safely enabled.</p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-sm font-bold text-yellow-400">{groups.length} duplicate group{groups.length !== 1 ? 's' : ''} found</p>
                  <p className="text-xs text-muted-foreground">Resolve all duplicates before enabling the UNIQUE constraint.</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : groups.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">✅ All phone numbers are unique.</p>
        ) : (
          <div className="space-y-3">
            {groups.map(g => (
              <Card key={g.phone_e164}>
                <CardContent className="p-4">
                  <p className="text-sm font-bold mb-2">📞 {g.phone_e164} <Badge variant="destructive" className="text-[10px] ml-2">{g.profiles.length} accounts</Badge></p>
                  <div className="space-y-2">
                    {g.profiles.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between bg-secondary/30 rounded-lg p-3 border border-border">
                        <div>
                          <p className="text-sm font-medium">{p.full_name} {p.username && <span className="text-muted-foreground text-xs">@{p.username}</span>}</p>
                          <p className="text-xs text-muted-foreground">{p.email} · Joined {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {i === 0 && <Badge variant="default" className="text-[10px]">Primary</Badge>}
                          {i > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              disabled={actionLoading === p.id}
                              onClick={() => clearPhone(p.id, g.phone_e164)}
                            >
                              {actionLoading === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Clear Phone'}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminPhoneCleanup;
