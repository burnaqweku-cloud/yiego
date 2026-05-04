import { useState } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import MarketingBannerTemplates from '@/components/agent/MarketingBannerTemplates';
import { toast } from 'sonner';
import { Copy, Share2, MessageCircle, Send, QrCode, Megaphone, AlertCircle } from 'lucide-react';

const AgentMarketingTools = () => {
  const { agent } = useAgent();

  // Canonical public store URL — used for all sharing/copying
  const shareUrl = agent ? `https://datasika.com/store/${agent.store_slug}` : '';

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success('Store link copied!');
  };

  const shareWhatsApp = () => {
    const text = `Buy cheap MTN/Telecel/AirtelTigo data bundles from my store 🔥\n\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareTelegram = () => {
    const text = `Buy cheap data bundles from my store: ${shareUrl}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const promoTemplates = [
    `🔥 Buy MTN/Telecel/AirtelTigo data bundles fast & cheap!\nOrder here: ${shareUrl}`,
    `Need data? Get the best prices on MTN, Telecel & AirtelTigo bundles 📱\nShop now: ${shareUrl}`,
    `Affordable data bundles for all networks! Fast delivery, trusted service ✅\n${shareUrl}`,
    `${agent?.store_name || 'My Store'} — Your go-to for cheap data bundles 🇬🇭\nOrder: ${shareUrl}`,
  ];

  const copyTemplate = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Message copied!');
  };

  if (!agent) {
    return (
      <AgentGate>
        <AgentLayout>
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Unable to load marketing tools. Please try again.</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        </AgentLayout>
      </AgentGate>
    );
  }

  return (
    <AgentGate>
    <AgentLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold">Marketing Tools</h1>
          <p className="text-xs text-muted-foreground">Promote your store and get more customers</p>
        </div>

        {/* Share Store Link */}
        <Card className="card-shadow border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" /> Share Your Store
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-3">
              <code className="flex-1 text-[11px] truncate text-muted-foreground">{shareUrl}</code>
              <Button variant="outline" size="sm" onClick={copyLink} className="shrink-0 gap-1.5 text-xs">
                <Copy className="w-3.5 h-3.5" /> Copy
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={shareWhatsApp} className="flex-1 gap-1.5 text-xs">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
              <Button variant="outline" size="sm" onClick={shareTelegram} className="flex-1 gap-1.5 text-xs">
                <Send className="w-3.5 h-3.5" /> Telegram
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card className="card-shadow border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <QrCode className="w-4 h-4 text-primary" /> Store QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}&bgcolor=ffffff&color=111111`}
              alt="Store QR Code"
              className="w-40 h-40 rounded-xl border border-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <p className="text-[11px] text-muted-foreground text-center">
              Let customers scan this to open your store instantly
            </p>
          </CardContent>
        </Card>

        {/* Dynamic Marketing Banners */}
        <Card className="card-shadow border-border">
          <CardContent className="pt-5">
            <MarketingBannerTemplates
              storeName={agent.store_name}
              whatsappNumber={agent.whatsapp_number}
              storeUrl={shareUrl}
              agentId={agent.id}
            />
          </CardContent>
        </Card>

        {/* Promo Templates */}
        <Card className="card-shadow border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" /> Promotional Messages
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[11px] text-muted-foreground">Copy and share these messages to promote your store:</p>
            {promoTemplates.map((template, i) => (
              <div key={i} className="bg-muted/30 rounded-xl p-3 space-y-2">
                <p className="text-xs whitespace-pre-line">{template}</p>
                <Button variant="ghost" size="sm" onClick={() => copyTemplate(template)} className="gap-1.5 text-[11px] h-7">
                  <Copy className="w-3 h-3" /> Copy message
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AgentLayout>
    </AgentGate>
  );
};

export default AgentMarketingTools;
