import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getWhatsAppSupportLink, SupportContext } from '@/lib/whatsapp-support';

interface Props {
  context?: SupportContext;
}

const WhatsAppSupportRedirect = ({ context = { type: 'default' } }: Props) => {
  const link = getWhatsAppSupportLink(context);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'rgba(34,197,94,0.15)', border: '1.5px solid rgba(34,197,94,0.25)' }}>
          <MessageSquare className="w-8 h-8" style={{ color: '#22C55E' }} />
        </div>
        <h1 className="text-xl font-display font-bold">Support is now on WhatsApp</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Ticket support is temporarily disabled. Please contact YieGo on WhatsApp for fast assistance.
        </p>
        <a href={link} target="_blank" rel="noopener noreferrer">
          <Button
            className="w-full gap-2 h-11 font-bold text-white border-0"
            style={{ background: '#22C55E' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#16A34A')}
            onMouseLeave={e => (e.currentTarget.style.background = '#22C55E')}
          >
            <MessageSquare className="w-4 h-4" />
            Chat on WhatsApp
          </Button>
        </a>
      </div>
    </div>
  );
};

export default WhatsAppSupportRedirect;
