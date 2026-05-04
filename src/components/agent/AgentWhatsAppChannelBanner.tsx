import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MessageCircle, X, ExternalLink } from 'lucide-react';
import { useAgent } from '@/hooks/useAgent';
import { supabase } from '@/integrations/supabase/client';

const CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb8ALcGEQIaoGxNBLk2a';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const AgentWhatsAppChannelBanner = () => {
  const { agent } = useAgent();
  const [visible, setVisible] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agent) return;
    checkDismissal();
  }, [agent]);

  const checkDismissal = async () => {
    if (!agent) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('agent_channel_dismissals' as any)
        .select('dismissed_at')
        .eq('agent_id', agent.id)
        .maybeSingle();

      if (!data) {
        setVisible(true);
      } else {
        const dismissedAt = new Date((data as any).dismissed_at).getTime();
        const now = Date.now();
        if (now - dismissedAt > SEVEN_DAYS_MS) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    } catch {
      setVisible(true);
    }
    setLoading(false);
  };

  const handleDismissAttempt = () => {
    setConfirmOpen(true);
  };

  const handleConfirmJoined = async () => {
    if (!agent) return;
    setConfirmOpen(false);
    setVisible(false);

    await supabase
      .from('agent_channel_dismissals' as any)
      .upsert({
        agent_id: agent.id,
        dismissed_at: new Date().toISOString(),
      } as any, { onConflict: 'agent_id' });
  };

  const handleNotYet = () => {
    setConfirmOpen(false);
    window.open(CHANNEL_URL, '_blank', 'noopener,noreferrer');
  };

  const handleJoinChannel = () => {
    window.open(CHANNEL_URL, '_blank', 'noopener,noreferrer');
  };

  if (loading || !visible || !agent) return null;

  return (
    <>
      <Card className="card-shadow border-green-500/30 overflow-hidden bg-gradient-to-r from-green-500/5 to-green-600/5">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-bold leading-tight">Join Agent Updates Channel</h3>
            </div>
            <Button
              onClick={handleJoinChannel}
              size="sm"
              className="gap-1 text-[10px] font-semibold h-7 px-2.5 shrink-0"
              style={{ background: '#25D366' }}
            >
              <ExternalLink className="w-3 h-3" /> Join
            </Button>
            <button
              onClick={handleDismissAttempt}
              className="p-1 rounded-lg hover:bg-muted transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Have you joined the WhatsApp channel?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You must join the agent updates channel to stay informed.
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={handleConfirmJoined} className="w-full">
              Yes, I joined
            </Button>
            <Button variant="outline" onClick={handleNotYet} className="w-full">
              Not yet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AgentWhatsAppChannelBanner;
