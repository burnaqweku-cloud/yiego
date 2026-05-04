import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Send, Users, Bell, RefreshCw, Smartphone, CheckCircle2, XCircle, Clock } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const AdminNotificationSender = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // In-app notification state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('system');
  const [target, setTarget] = useState<'all' | 'selected'>('all');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [sending, setSending] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Push notification state
  const [pushTitle, setPushTitle] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const [pushUrl, setPushUrl] = useState('');
  const [pushSegment, setPushSegment] = useState<'All' | 'Agents' | 'Users' | 'Admins'>('All');
  const [sendingPush, setSendingPush] = useState(false);
  const [pushLogs, setPushLogs] = useState<any[]>([]);
  const [loadingPushLogs, setLoadingPushLogs] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate('/auth');
    else if (isAdmin) {
      fetchRecent();
      fetchPushLogs();
    }
  }, [user, isAdmin, authLoading]);

  const fetchRecent = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('notifications' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setRecentNotifications((data as any[]) || []);
    setLoadingRecent(false);
  };

  const fetchPushLogs = async () => {
    setLoadingPushLogs(true);
    const { data } = await supabase
      .from('push_notification_logs' as any)
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(30);
    setPushLogs((data as any[]) || []);
    setLoadingPushLogs(false);
  };

  const handleSendInApp = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error('Title and message are required');
      return;
    }

    setSending(true);
    try {
      if (target === 'all') {
        const { data: profiles } = await supabase.from('profiles').select('id');
        if (!profiles || profiles.length === 0) {
          toast.error('No users found');
          setSending(false);
          return;
        }

        const batch = profiles.map((p: any) => ({
          user_id: p.id,
          title: title.trim(),
          message: message.trim(),
          type,
          read: false,
        }));

        const BATCH_SIZE = 100;
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          const chunk = batch.slice(i, i + BATCH_SIZE);
          await supabase.from('notifications' as any).insert(chunk as any);
        }

        toast.success(`Notification sent to ${profiles.length} users`);
      } else {
        if (!selectedUserId.trim()) {
          toast.error('Please enter a user ID');
          setSending(false);
          return;
        }
        await supabase.from('notifications' as any).insert({
          user_id: selectedUserId.trim(),
          title: title.trim(),
          message: message.trim(),
          type,
          read: false,
        } as any);
        toast.success('Notification sent');
      }

      setTitle('');
      setMessage('');
      fetchRecent();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushMessage.trim()) {
      toast.error('Push title and message are required');
      return;
    }

    setSendingPush(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const idempotencyKey = `admin_push_${Date.now()}_${user?.id}`;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          title: pushTitle.trim(),
          message: pushMessage.trim(),
          segment: pushSegment,
          url: pushUrl.trim() || undefined,
          idempotencyKey,
          triggeredBy: 'admin',
          entityType: 'broadcast',
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Push send failed');
      }

      if (result.duplicate) {
        toast.warning('This notification was already sent (duplicate prevented)');
      } else {
        toast.success(`Push notification sent! Recipients: ${result.recipients ?? '—'}`);
        setPushTitle('');
        setPushMessage('');
        setPushUrl('');
        fetchPushLogs();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send push notification');
    } finally {
      setSendingPush(false);
    }
  };

  if (authLoading || !user || !isAdmin) return null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold">Notifications</h2>
            <p className="text-muted-foreground text-sm">Send in-app and push notifications to users</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchRecent(); fetchPushLogs(); }} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        <Tabs defaultValue="push">
          <TabsList className="mb-4">
            <TabsTrigger value="push" className="gap-2">
              <Smartphone className="w-3.5 h-3.5" /> Push Notifications
            </TabsTrigger>
            <TabsTrigger value="inapp" className="gap-2">
              <Bell className="w-3.5 h-3.5" /> In-App Notifications
            </TabsTrigger>
          </TabsList>

          {/* ── PUSH NOTIFICATIONS TAB ── */}
          <TabsContent value="push">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Compose Push */}
              <Card className="card-shadow">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-primary" />
                    <h3 className="font-bold text-sm">Send Push Notification</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto border-primary/30 text-primary">OneSignal</Badge>
                  </div>

                  <div>
                    <Label>Audience Segment</Label>
                    <Select value={pushSegment} onValueChange={(v: any) => setPushSegment(v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5" /> All Subscribers
                          </div>
                        </SelectItem>
                        <SelectItem value="Agents">Agents Only</SelectItem>
                        <SelectItem value="Users">Normal Users Only</SelectItem>
                        <SelectItem value="Admins">Admins / Staff Only</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Segments are based on OneSignal tags set at subscription time.
                    </p>
                  </div>

                  <div>
                    <Label>Title</Label>
                    <Input
                      value={pushTitle}
                      onChange={e => setPushTitle(e.target.value)}
                      placeholder="e.g. Data Delivered ✅"
                      className="mt-1"
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <Label>Message</Label>
                    <Textarea
                      value={pushMessage}
                      onChange={e => setPushMessage(e.target.value)}
                      placeholder="Your data bundle has been delivered..."
                      className="mt-1"
                      rows={3}
                      maxLength={250}
                    />
                  </div>

                  <div>
                    <Label>Redirect URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input
                      value={pushUrl}
                      onChange={e => setPushUrl(e.target.value)}
                      placeholder="https://yiego.com/dashboard/orders"
                      className="mt-1"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Where to send users when they tap the notification.
                    </p>
                  </div>

                  <Button
                    onClick={handleSendPush}
                    disabled={sendingPush || !pushTitle.trim() || !pushMessage.trim()}
                    className="w-full gap-2"
                  >
                    {sendingPush
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending...</>
                      : <><Send className="w-4 h-4" /> Send Push Notification</>
                    }
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center">
                    Notifications are sent via OneSignal Web Push. Duplicate sends are automatically prevented.
                  </p>
                </CardContent>
              </Card>

              {/* Push Logs */}
              <Card className="card-shadow">
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Bell className="w-4 h-4" /> Recent Push Sends
                  </h3>

                  {loadingPushLogs ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 rounded-lg" />
                      ))}
                    </div>
                  ) : pushLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No push notifications sent yet</p>
                  ) : (
                    <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                      {pushLogs.map((log: any) => (
                        <div key={log.id} className="bg-muted/30 rounded-lg p-3 text-xs space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold truncate">{log.title}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {log.status === 'sent'
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-chart-2" />
                                : <XCircle className="w-3.5 h-3.5 text-destructive" />
                              }
                              <Badge variant="outline" className="text-[9px] py-0">
                                {log.segment || 'All'}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-muted-foreground line-clamp-1">{log.message}</p>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-2.5 h-2.5" /> {log.recipients ?? '—'} recipients
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {new Date(log.sent_at).toLocaleString()}
                            </span>
                          </div>
                          {log.error_message && (
                            <p className="text-destructive text-[10px]">{log.error_message}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── IN-APP NOTIFICATIONS TAB ── */}
          <TabsContent value="inapp">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Compose */}
              <Card className="card-shadow">
                <CardContent className="p-5 space-y-4">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Send className="w-4 h-4" /> Compose In-App Notification
                  </h3>

                  <div>
                    <Label>Target</Label>
                    <Select value={target} onValueChange={(v: any) => setTarget(v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        <SelectItem value="selected">Specific User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {target === 'selected' && (
                    <div>
                      <Label>User ID</Label>
                      <Input
                        value={selectedUserId}
                        onChange={e => setSelectedUserId(e.target.value)}
                        placeholder="Enter user UUID"
                        className="mt-1"
                      />
                    </div>
                  )}

                  <div>
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="order">Order</SelectItem>
                        <SelectItem value="wallet">Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Title</Label>
                    <Input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Notification title"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Message</Label>
                    <Textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Notification message..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  <Button onClick={handleSendInApp} disabled={sending} className="w-full gap-2">
                    {sending ? 'Sending...' : <><Send className="w-4 h-4" /> Send In-App Notification</>}
                  </Button>
                </CardContent>
              </Card>

              {/* Recent In-App */}
              <Card className="card-shadow">
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Bell className="w-4 h-4" /> Recent In-App Notifications
                  </h3>

                  {loadingRecent ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 rounded-lg" />
                      ))}
                    </div>
                  ) : recentNotifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No notifications sent yet</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {recentNotifications.map((n: any) => (
                        <div key={n.id} className="bg-muted/30 rounded-lg p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{n.title}</span>
                            <span className={`text-[10px] ${n.read ? 'text-muted-foreground' : 'text-primary font-medium'}`}>
                              {n.read ? 'Read' : 'Unread'}
                            </span>
                          </div>
                          <p className="text-muted-foreground line-clamp-1">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminNotificationSender;
