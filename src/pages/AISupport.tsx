import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import { Button } from '@/components/ui/button';
import { MessageCircle, Search, Clock, ExternalLink, ClipboardList } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const AISupport = () => {
  const { user } = useAuth();

  const openChat = () => {
    // Programmatically click the floating chat button
    const btn = document.querySelector('[aria-label="Open support chat"]') as HTMLButtonElement;
    btn?.click();
  };

  return (
    <Layout>
      <SEOHead
        title="Support | DataSika"
        description="Get help with your DataSika account, orders, deposits, and more. AI-powered support available 9 AM – 9 PM."
        path="/ai-support"
      />

      <div className="container max-w-xl py-10 px-4 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <MessageCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold">Support Assistant</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Get instant help with orders, deposits, and account issues. Our AI assistant is here to help you.
          </p>
        </div>

        {/* Working Hours */}
        <div className="bg-muted/30 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Support Hours</p>
          </div>
          <p className="text-sm text-muted-foreground">
            9:00 AM – 9:00 PM (Ghana time). Most issues are reviewed within minutes during active hours.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <Button onClick={openChat} className="w-full h-12 text-sm font-semibold gap-2 rounded-xl">
            <MessageCircle className="w-4 h-4" />
            Start Support Chat
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              openChat();
              // Small delay then switch to track view
              setTimeout(() => {
                const hubBtn = document.querySelector('[aria-label="Support chat"]');
                if (hubBtn) {
                  // The chat is open, we'll let the user navigate from there
                }
              }, 500);
            }}
            className="w-full h-12 text-sm font-semibold gap-2 rounded-xl"
          >
            <Search className="w-4 h-4" />
            Track a Ticket
          </Button>

          {user && (
            <Button
              variant="outline"
              onClick={openChat}
              className="w-full h-12 text-sm font-semibold gap-2 rounded-xl"
            >
              <ClipboardList className="w-4 h-4" />
              View My Tickets
            </Button>
          )}
        </div>

        {/* What we can help with */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold">What we can help with</h2>
          <div className="grid gap-2">
            {[
              { label: 'Order not created after payment', icon: '📦' },
              { label: 'Deposit not reflected in wallet', icon: '💰' },
              { label: 'Order delivery issues', icon: '📡' },
              { label: 'Account & access problems', icon: '🔐' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 bg-muted/20 rounded-xl px-4 py-3">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="text-center space-y-2 pt-2">
          <p className="text-xs text-muted-foreground">For urgent issues outside support hours:</p>
          <a
            href="mailto:support@datasika.com"
            className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
          >
            support@datasika.com
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </Layout>
  );
};

export default AISupport;
