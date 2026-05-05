import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MessageSquare, Settings, ScrollText, Search, RefreshCw, Send, TestTube, ShieldCheck, FileText, RotateCcw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const SMS_EVENTS = [
  { key: 'welcome_sms', label: 'Welcome SMS', desc: 'After new user registration' },
  { key: 'wallet_deposit_success', label: 'Wallet Deposit', desc: 'After successful wallet top-up' },
  { key: 'wallet_deposit_failed', label: 'Deposit Failed', desc: 'After failed deposit attempt' },
  { key: 'agent_application_received', label: 'Agent Application', desc: 'When agent submits application' },
  { key: 'agent_approved', label: 'Agent Approved', desc: 'When admin approves agent' },
  { key: 'agent_discount_expiring', label: 'Discount Expiring', desc: 'Before activation discount expires' },
  { key: 'agent_subscription_active', label: 'Store Activated', desc: 'After subscription payment' },
  { key: 'subscription_expiring_soon', label: 'Sub Expiring Soon', desc: '3 days before subscription expires' },
  { key: 'subscription_expires_today', label: 'Sub Expires Today', desc: 'On subscription expiry day' },
  { key: 'subscription_expired', label: 'Sub Expired', desc: 'After subscription has expired' },
  { key: 'withdrawal_requested', label: 'Withdrawal Request', desc: 'When agent requests withdrawal' },
  { key: 'withdrawal_paid', label: 'Withdrawal Paid', desc: 'When admin marks withdrawal paid' },
  { key: 'admin_withdrawal_alert', label: 'Admin Withdrawal Alert', desc: 'Admin SMS for new withdrawal requests' },
];

const PLACEHOLDERS: Record<string, string[]> = {
  welcome_sms: ['name'],
  wallet_deposit_success: ['name', 'amount', 'balance', 'reference'],
  wallet_deposit_failed: [],
  agent_application_received: [],
  agent_approved: ['name'],
  agent_discount_expiring: ['hours_left'],
  agent_subscription_active: [],
  subscription_expiring_soon: ['days_left'],
  subscription_expires_today: [],
  subscription_expired: [],
  withdrawal_requested: ['amount'],
  withdrawal_paid: ['amount'],
  admin_withdrawal_alert: ['amount', 'agent_name'],
};

const SAMPLE_VARS: Record<string, string> = {
  name: 'Kwame',
  amount: '50.00',
  balance: '120.00',
  reference: 'TXN-ABC123',
  network: 'MTN',
  bundle: '5GB',
  phone: '0551234567',
  order_id: 'YG-XYZ789',
};

interface SmsLog {
  id: string;
  created_at: string;
  to_number: string;
  message: string;
  event_type: string;
  status: string;
  error_message: string | null;
  order_id: string | null;
  reference: string | null;
  provider_message_id: string | null;
  http_status: number | null;
  provider_response: string | null;
  provider_response_code: string | null;
  request_payload: string | null;
  attempts: number;
}

const AdminSMSSettings = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEvent, setFilterEvent] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Test SMS state
  const [testPhone, setTestPhone] = useState('');
  const [testTemplate, setTestTemplate] = useState(SMS_EVENTS[0].key);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  // Template editor state
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [defaultTemplates, setDefaultTemplates] = useState<Record<string, string>>({});
  const [templateSaving, setTemplateSaving] = useState<string | null>(null);
  const [previewEvent, setPreviewEvent] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchLogs();
    fetchTemplates();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .like('key', 'sms_%');
    const s: Record<string, string> = {};
    (data || []).forEach((r: any) => { s[r.key] = r.value; });
    setSettings(s);
    setLoading(false);
  };

  const fetchTemplates = async () => {
    // Fetch custom templates from site_settings
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .like('key', 'sms_template_%');
    const t: Record<string, string> = {};
    (data || []).forEach((r: any) => {
      const eventKey = r.key.replace('sms_template_', '');
      t[eventKey] = r.value;
    });

    // Fetch default templates from edge function
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: 'get_default_templates' }),
        }
      );
      const result = await res.json();
      if (result.templates) {
        setDefaultTemplates(result.templates);
        // Merge: use custom if exists, else default
        const merged: Record<string, string> = {};
        for (const key of Object.keys(result.templates)) {
          merged[key] = t[key] || result.templates[key];
        }
        setTemplates(merged);
      }
    } catch {
      // Fallback: just use what we got from DB
      setTemplates(t);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    let query = supabase
      .from('sms_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);
    if (filterEvent !== 'all') query = query.eq('event_type', filterEvent);

    const { data } = await query;
    let filtered = (data || []) as SmsLog[];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(l =>
        l.to_number?.includes(q) ||
        l.order_id?.toLowerCase().includes(q) ||
        l.reference?.toLowerCase().includes(q) ||
        l.message?.toLowerCase().includes(q)
      );
    }
    setLogs(filtered);
    setLogsLoading(false);
  };

  const toggleSetting = async (key: string) => {
    const fullKey = key === 'enabled' ? 'sms_enabled' : `sms_${key}`;
    const currentVal = settings[fullKey] || 'false';
    const newVal = currentVal === 'true' ? 'false' : 'true';
    setSaving(true);

    // Upsert: if setting doesn't exist yet, create it
    const { error } = await supabase
      .from('site_settings')
      .upsert(
        { key: fullKey, value: newVal, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (!error) {
      setSettings(prev => ({ ...prev, [fullKey]: newVal }));
      toast.success(`${key === 'enabled' ? 'Global SMS' : SMS_EVENTS.find(e => e.key === key)?.label || key} ${newVal === 'true' ? 'enabled' : 'disabled'}`);
    } else {
      toast.error('Failed to update setting');
    }
    setSaving(false);
  };

  const saveTemplate = async (eventKey: string) => {
    const templateText = templates[eventKey] || '';
    const settingKey = `sms_template_${eventKey}`;
    setTemplateSaving(eventKey);

    const { error } = await supabase
      .from('site_settings')
      .upsert(
        { key: settingKey, value: templateText, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (!error) {
      toast.success('Template saved');
    } else {
      toast.error('Failed to save template');
    }
    setTemplateSaving(null);
  };

  const resetTemplate = async (eventKey: string) => {
    const defaultText = defaultTemplates[eventKey] || '';
    setTemplates(prev => ({ ...prev, [eventKey]: defaultText }));

    // Delete custom template from DB so it falls back to default
    await supabase
      .from('site_settings')
      .delete()
      .eq('key', `sms_template_${eventKey}`);

    toast.success('Template reset to default');
  };

  const getPreviewText = (eventKey: string): string => {
    const tpl = templates[eventKey] || '';
    let result = tpl;
    for (const [key, value] of Object.entries(SAMPLE_VARS)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  };

  const sendTestSMS = async () => {
    if (!testPhone.trim()) {
      toast.error('Enter a phone number');
      return;
    }

    setTestSending(true);
    setTestResult(null);

    // Use the current template text with sample vars
    const templateText = templates[testTemplate] || '';
    let messageText = templateText;
    for (const [key, value] of Object.entries(SAMPLE_VARS)) {
      messageText = messageText.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            to: testPhone.trim(),
            message: messageText,
            event_type: `test_${testTemplate}`,
            skip_checks: true,
          }),
        }
      );
      const result = await res.json();
      setTestResult(result);

      if (result.sent) {
        toast.success('Test SMS sent successfully!');
      } else {
        toast.error(`SMS failed: ${result.error || result.reason || 'Unknown error'}`);
      }

      setTimeout(() => fetchLogs(), 1500);
    } catch (err) {
      const errMsg = String(err);
      setTestResult({ sent: false, error: errMsg });
      toast.error(`Request failed: ${errMsg}`);
    }

    setTestSending(false);
  };

  const verifyApiKey = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: 'verify_api_key' }),
        }
      );
      const result = await res.json();
      setVerifyResult(result);
      if (result.valid) {
        toast.success('API Key is valid!');
      } else {
        toast.error(`API Key invalid: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      setVerifyResult({ valid: false, error: String(err) });
      toast.error('Verification request failed');
    }
    setVerifying(false);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
      case 'failed': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'skipped': return 'bg-amber-500/10 text-amber-600 border-amber-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const smsCharCount = (text: string) => {
    const len = text.length;
    const parts = len <= 160 ? 1 : Math.ceil(len / 153);
    return { len, parts };
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-display font-bold">SMS Settings</h1>
            <p className="text-sm text-muted-foreground">Manage SMS notifications</p>
          </div>
        </div>

        <Tabs defaultValue="settings">
          <TabsList className="flex-wrap">
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Settings
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Templates
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-1.5">
              <TestTube className="w-3.5 h-3.5" /> Test SMS
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5">
              <ScrollText className="w-3.5 h-3.5" /> SMS Logs
            </TabsTrigger>
          </TabsList>

          {/* Settings tab */}
          <TabsContent value="settings" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Global SMS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Enable SMS Notifications</Label>
                    <p className="text-xs text-muted-foreground">Master switch for all SMS</p>
                  </div>
                  <Switch
                    checked={settings.sms_enabled === 'true'}
                    onCheckedChange={() => toggleSetting('enabled')}
                    disabled={loading || saving}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Verify API Key */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Verify API Key
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Test if the API key is valid by checking account balance.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={verifyApiKey}
                  disabled={verifying}
                  className="gap-2"
                >
                  {verifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  {verifying ? 'Verifying...' : 'Verify API Key'}
                </Button>
                {verifyResult && (
                  <div className={`p-3 rounded-lg border text-sm ${verifyResult.valid ? 'bg-emerald-500/10 border-emerald-300 text-emerald-700' : 'bg-destructive/10 border-destructive/30 text-destructive'}`}>
                    <p className="font-medium">{verifyResult.valid ? '✓ API Key is valid' : '✗ API Key is invalid'}</p>
                    {verifyResult.error && <p className="text-xs mt-1">{verifyResult.error}</p>}
                    {verifyResult.http_status && <p className="text-xs mt-1">HTTP {verifyResult.http_status}</p>}
                    {verifyResult.response && (
                      <details className="mt-2">
                        <summary className="text-xs cursor-pointer">Raw response</summary>
                        <pre className="text-xs mt-1 p-2 bg-muted rounded overflow-x-auto max-h-32">{verifyResult.response}</pre>
                      </details>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Event Toggles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {SMS_EVENTS.map(evt => (
                  <div key={evt.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <Label className="font-medium text-sm">{evt.label}</Label>
                      <p className="text-xs text-muted-foreground">{evt.desc}</p>
                    </div>
                    <Switch
                      checked={settings[`sms_${evt.key}`] === 'true'}
                      onCheckedChange={() => toggleSetting(evt.key)}
                      disabled={loading || saving || settings.sms_enabled !== 'true'}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Templates tab */}
          <TabsContent value="templates" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" /> SMS Templates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">
                  Edit the SMS message for each event. Use placeholders like <code className="bg-muted px-1 rounded">{'{name}'}</code>, <code className="bg-muted px-1 rounded">{'{amount}'}</code>, etc. The Sender ID "DTSIKA" is automatically shown in the SMS header — do not include it in the message body.
                </p>
              </CardContent>
            </Card>

            {SMS_EVENTS.map(evt => {
              const text = templates[evt.key] || '';
              const { len, parts } = smsCharCount(text);
              const isCustom = text !== (defaultTemplates[evt.key] || '');
              const availablePlaceholders = PLACEHOLDERS[evt.key] || [];

              return (
                <Card key={evt.key}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{evt.label}</CardTitle>
                      <div className="flex items-center gap-2">
                        {isCustom && (
                          <Badge variant="outline" className="text-[10px]">Custom</Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${parts > 1 ? 'text-amber-600' : ''}`}>
                          {len} chars · {parts} SMS
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {availablePlaceholders.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[10px] text-muted-foreground mr-1">Placeholders:</span>
                        {availablePlaceholders.map(p => (
                          <Badge
                            key={p}
                            variant="secondary"
                            className="text-[10px] cursor-pointer"
                            onClick={() => {
                              setTemplates(prev => ({
                                ...prev,
                                [evt.key]: (prev[evt.key] || '') + `{${p}}`
                              }));
                            }}
                          >
                            {`{${p}}`}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <Textarea
                      value={text}
                      onChange={e => setTemplates(prev => ({ ...prev, [evt.key]: e.target.value }))}
                      rows={3}
                      className="text-sm font-mono"
                      placeholder="Enter SMS template..."
                    />

                    {/* Preview */}
                    {previewEvent === evt.key && (
                      <div className="p-3 rounded-lg bg-muted/50 border border-border">
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">Preview (sample data):</p>
                        <p className="text-sm">{getPreviewText(evt.key)}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveTemplate(evt.key)}
                        disabled={templateSaving === evt.key}
                        className="gap-1.5"
                      >
                        {templateSaving === evt.key ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewEvent(previewEvent === evt.key ? null : evt.key)}
                        className="gap-1.5"
                      >
                        <Eye className="w-3 h-3" />
                        {previewEvent === evt.key ? 'Hide Preview' : 'Preview'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resetTemplate(evt.key)}
                        className="gap-1.5 text-muted-foreground"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Test SMS tab */}
          <TabsContent value="test" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4" /> Send Test SMS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Send a test SMS using the current template. This bypasses toggle/dedupe/rate checks.
                </p>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Phone Number</Label>
                    <Input
                      value={testPhone}
                      onChange={e => setTestPhone(e.target.value)}
                      placeholder="0551234567 or 233551234567"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-sm">Message Template</Label>
                    <Select value={testTemplate} onValueChange={setTestTemplate}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SMS_EVENTS.map(t => (
                          <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Preview:</p>
                    <p className="text-sm">{getPreviewText(testTemplate)}</p>
                  </div>

                  <Button
                    onClick={sendTestSMS}
                    disabled={testSending || !testPhone.trim()}
                    className="gap-2"
                  >
                    {testSending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {testSending ? 'Sending...' : 'Send Test SMS'}
                  </Button>
                </div>

                {/* Test Result */}
                {testResult && (
                  <Card className={`mt-4 ${testResult.sent ? 'border-emerald-300' : 'border-destructive/50'}`}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className={testResult.sent ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}>
                          {testResult.sent ? 'SENT' : 'FAILED'}
                        </Badge>
                        {testResult.http_status && (
                          <Badge variant="outline" className="text-xs">HTTP {testResult.http_status}</Badge>
                        )}
                        {testResult.provider_response_code && (
                          <Badge variant="outline" className="text-xs">Code: {testResult.provider_response_code}</Badge>
                        )}
                      </div>

                      {testResult.error && (
                        <p className="text-sm text-destructive font-medium">{testResult.error}</p>
                      )}

                      {testResult.message_id && (
                        <p className="text-xs text-muted-foreground">Message ID: {testResult.message_id}</p>
                      )}

                      {testResult.provider_response_raw && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Raw Provider Response
                          </summary>
                          <pre className="mt-1 text-xs p-2 bg-muted rounded overflow-x-auto max-h-40">
                            {testResult.provider_response_raw}
                          </pre>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logs tab */}
          <TabsContent value="logs" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); }}>
                <SelectTrigger className="w-[130px] h-9 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterEvent} onValueChange={v => { setFilterEvent(v); }}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <SelectValue placeholder="Event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  {SMS_EVENTS.map(e => (
                    <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search phone, order, ref..."
                  className="pl-8 h-9 text-xs"
                />
              </div>

              <Button size="sm" variant="outline" onClick={fetchLogs} disabled={logsLoading} className="h-9 gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Time</TableHead>
                        <TableHead className="text-xs">To</TableHead>
                        <TableHead className="text-xs">Event</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">HTTP</TableHead>
                        <TableHead className="text-xs">Error / Response</TableHead>
                        <TableHead className="text-xs w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                            No SMS logs found
                          </TableCell>
                        </TableRow>
                      )}
                      {logs.map(log => (
                        <>
                          <TableRow key={log.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(new Date(log.created_at), 'MMM d, HH:mm')}
                            </TableCell>
                            <TableCell className="text-xs font-mono">{log.to_number}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{log.event_type}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] ${statusColor(log.status)}`}>{log.status}</Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {log.http_status || '—'}
                            </TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate">
                              {log.error_message || log.provider_response_code || '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {expandedLog === log.id ? '▲' : '▼'}
                            </TableCell>
                          </TableRow>
                          {expandedLog === log.id && (
                            <TableRow key={`${log.id}-detail`}>
                              <TableCell colSpan={7} className="bg-muted/20 p-3">
                                <div className="space-y-2 text-xs">
                                  <div><strong>Message:</strong> {log.message}</div>
                                  <div><strong>Attempts:</strong> {log.attempts}</div>
                                  {log.provider_message_id && <div><strong>Provider ID:</strong> {log.provider_message_id}</div>}
                                  {log.request_payload && (
                                    <div>
                                      <strong>Request Payload:</strong>
                                      <pre className="mt-1 p-2 bg-muted rounded overflow-x-auto text-[11px]">{log.request_payload}</pre>
                                    </div>
                                  )}
                                  {log.provider_response && (
                                    <div>
                                      <strong>Provider Response:</strong>
                                      <pre className="mt-1 p-2 bg-muted rounded overflow-x-auto text-[11px] max-h-32">{log.provider_response}</pre>
                                    </div>
                                  )}
                                  {log.error_message && (
                                    <div className="text-destructive"><strong>Error:</strong> {log.error_message}</div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminSMSSettings;
