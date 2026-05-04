import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { useAgent } from '@/hooks/useAgent';
import { getWhatsAppSupportLink } from '@/lib/whatsapp-support';

const AgentSupportCard = () => {
  const { agent } = useAgent();
  const link = getWhatsAppSupportLink({ type: 'agent', storeName: agent?.store_name || undefined });

  return (
    <Card className="card-shadow border-border overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(34,197,94,0.15)', border: '1.5px solid rgba(34,197,94,0.25)' }}>
            <MessageSquare className="w-5 h-5" style={{ color: '#22C55E' }} />
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-sm font-bold">Need Help?</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Chat with our support team on WhatsApp for fast assistance. We typically respond within a few minutes.
            </p>
            <a href={link} target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs mt-1"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat on WhatsApp
                <ArrowRight className="w-3 h-3" />
              </Button>
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AgentSupportCard;
