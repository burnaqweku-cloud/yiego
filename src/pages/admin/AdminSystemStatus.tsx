import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Activity, Power, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const AdminSystemStatus = () => {
  const { user, isAdminOrStaff, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { status, loading, updateStatus } = useSystemStatus();

  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState('');
  const [statusText, setStatusText] = useState('System Online');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  useEffect(() => {
    if (!loading) {
      setOnline(status.online);
      setMessage(status.message);
      setStatusText(status.statusText || 'System Online');
    }
  }, [loading, status]);

  if (authLoading || !user || !isAdminOrStaff) return null;

  const handleSave = async () => {
    setSaving(true);
    await updateStatus(online, message, statusText);
    setSaving(false);
    toast.success('System status updated');
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-2xl font-display font-bold">System Status</h2>
          <p className="text-muted-foreground text-sm">Control the system status shown on user dashboards</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Status Control</h3>
              <p className="text-xs text-muted-foreground">Toggle system online/offline</p>
            </div>
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${online ? 'bg-[hsl(142,70%,45%)]' : 'bg-destructive'}`} />
              <div>
                <p className="text-sm font-semibold">{online ? (statusText || 'System Online') : 'System Offline'}</p>
                <p className="text-xs text-muted-foreground">
                  {online ? 'Users see orders are processing normally' : 'Users see a service delay warning'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOnline(!online)}
              className={`w-12 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                online ? 'bg-[hsl(142,70%,45%)]' : 'bg-muted-foreground/30'
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                online ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div>
            <Label>Status Label (shown everywhere)</Label>
            <Input
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="System Online"
              className="mt-1"
              maxLength={40}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This text replaces "System Online" across all pages (max 40 chars)
            </p>
          </div>

          <div>
            <Label>Status Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Orders are processing normally."
              className="mt-1"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This message is shown to all users on their dashboard
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Update Status'}
          </Button>
        </div>

        {/* Current status preview */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-display font-semibold text-sm mb-3">User Preview</h3>
          <div className={`rounded-xl p-4 border ${
            online
              ? 'bg-[hsl(142,70%,45%)]/5 border-[hsl(142,70%,45%)]/20'
              : 'bg-destructive/5 border-destructive/20'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-[hsl(142,70%,45%)]' : 'bg-destructive'}`} />
              <span className="text-sm font-semibold">{online ? (statusText || 'System Online') : 'System Offline'}</span>
            </div>
            <p className="text-xs text-muted-foreground">{message || 'No message set'}</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSystemStatus;
