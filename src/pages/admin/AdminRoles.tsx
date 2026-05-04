import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, UserPlus, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  user_email?: string;
  user_name?: string;
}

const AdminRoles = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { log } = useAuditLog();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, authLoading, navigate]);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('user_roles')
      .select('*');

    if (data) {
      const userIds = [...new Set(data.map((r: any) => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const profileMap: Record<string, any> = {};
      profiles?.forEach((p: any) => { profileMap[p.id] = p; });

      setRoles(data.map((r: any) => ({
        ...r,
        user_name: profileMap[r.user_id]?.full_name || 'Unknown',
        user_email: profileMap[r.user_id]?.email || '',
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchRoles();
  }, [isAdmin, fetchRoles]);

  const handleRemoveRole = async (role: UserRole) => {
    if (!confirm(`Remove ${role.role} role from ${role.user_name}?`)) return;

    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('id', role.id);

    if (error) {
      toast.error('Failed to remove role');
      return;
    }

    await log({
      action: 'role_removed',
      entity_type: 'user_role',
      entity_id: role.user_id,
      changes: { role: { before: role.role, after: null } },
    });

    toast.success(`${role.role} role removed from ${role.user_name}`);
    fetchRoles();
  };

  if (authLoading || !user || !isAdmin) return null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Members & Roles</h2>
            <p className="text-muted-foreground text-sm">Manage admin and staff access</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchRoles} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              Add Staff
            </Button>
          </div>
        </div>

        {/* Role list */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No roles assigned yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {roles.map((role) => (
              <div key={role.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between card-shadow">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    role.role === 'admin' ? 'bg-primary/10' : 'bg-info/10'
                  }`}>
                    <Shield className={`w-4 h-4 ${role.role === 'admin' ? 'text-primary' : 'text-info'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{role.user_name}</p>
                    <p className="text-xs text-muted-foreground">{role.user_email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${
                    role.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-info/10 text-info'
                  }`}>
                    {role.role}
                  </span>
                  {role.user_id !== user?.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveRole(role)}
                      className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <AddRoleDialog
            onClose={() => { setShowAdd(false); fetchRoles(); }}
          />
        )}
      </div>
    </AdminLayout>
  );
};

const AddRoleDialog = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuth();
  const { log } = useAuditLog();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!email.trim()) {
      toast.error('Please enter an email');
      return;
    }

    setSaving(true);

    // Find user by email
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', email.trim())
      .maybeSingle();

    if (!profile) {
      toast.error('No user found with that email. They must register first.');
      setSaving(false);
      return;
    }

    // Check if role already exists
    const { data: existing } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', profile.id)
      .eq('role', role)
      .maybeSingle();

    if (existing) {
      toast.error(`User already has the ${role} role`);
      setSaving(false);
      return;
    }

    // Insert role
    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: profile.id, role });

    if (error) {
      toast.error('Failed to add role: ' + error.message);
      setSaving(false);
      return;
    }

    await log({
      action: 'role_added',
      entity_type: 'user_role',
      entity_id: profile.id,
      changes: { role: { before: null, after: role } },
      metadata: { target_email: email },
    });

    toast.success(`${role} role assigned to ${profile.full_name}`);
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add Staff Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>User Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="mt-1"
              type="email"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              The user must already have a registered account
            </p>
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'staff')}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff (view analytics + manage orders)</SelectItem>
                <SelectItem value="admin">Admin (full access)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="flex-1">
              {saving ? 'Adding...' : 'Add Role'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminRoles;
