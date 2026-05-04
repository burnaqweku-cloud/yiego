import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle, Smartphone, Globe, ExternalLink, Zap, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDevicePlatform, isIOSSafari } from '@/hooks/useDeviceDetect';

const ShareIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
    <rect x="4" y="8" width="16" height="14" rx="2" />
    <polyline points="8 8 12 3 16 8" />
    <line x1="12" y1="3" x2="12" y2="16" />
  </svg>
);

const DotsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

/** Non-Safari iOS view — tells user to open in Safari first */
const OpenInSafariMessage = () => (
  <Layout>
    <div className="container py-12 max-w-md mx-auto px-4 text-center">
      <div className="w-20 h-20 rounded-[1.25rem] mx-auto mb-5 overflow-hidden shadow-md border border-border">
        <img src="/datasika-icon.png?v=2" alt="YieGo" className="w-full h-full object-cover" />
      </div>
      <h1 className="text-2xl font-bold mb-2 text-foreground">Open in Safari</h1>
      <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
        To install YieGo on your iPhone, you need to open this page in <strong className="text-foreground">Safari</strong>.
      </p>

      <div className="border border-border rounded-2xl p-5 bg-card shadow-sm mb-6 text-left">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tap the <strong className="text-foreground">Share</strong> button in your current browser, then choose <strong className="text-foreground">"Open in Safari"</strong> if available. Or copy this link and paste it into Safari:
        </p>
        <div className="mt-3 flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5 border border-border">
          <span className="text-xs text-foreground font-mono truncate flex-1">yiego.com/app/ios</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
            }}
            className="text-xs text-primary font-bold shrink-0"
          >
            Copy
          </button>
        </div>
      </div>

      <Link to="/">
        <Button variant="outline" className="gap-2 rounded-xl h-11 px-6">
          <Globe className="w-4 h-4" />
          Go to Homepage
        </Button>
      </Link>
    </div>
  </Layout>
);

/** Safari iOS view — real install instructions */
const SafariInstallGuide = () => (
  <Layout>
    <div className="container py-8 md:py-12 max-w-lg mx-auto px-4">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-[1.25rem] mx-auto mb-4 overflow-hidden shadow-md border border-border">
          <img src="/datasika-icon.png?v=2" alt="YieGo" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-2xl font-bold mb-1.5 text-foreground">Install YieGo</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Add to your Home Screen in 3 quick steps.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-5">
        {/* Step A */}
        <div className="border border-border rounded-2xl p-5 bg-card shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">A</div>
            <div>
              <p className="font-semibold text-sm text-foreground">Tap the Share icon or (⋯) menu</p>
            </div>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <p className="text-xs text-muted-foreground mb-3">Look at the bottom bar of Safari:</p>
            <div className="flex items-center justify-center gap-8">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-11 h-11 rounded-xl bg-primary/15 border-2 border-primary flex items-center justify-center">
                  <ShareIcon />
                </div>
                <span className="text-[10px] font-semibold text-primary">Share icon</span>
              </div>
              <span className="text-xs text-muted-foreground font-medium">or</span>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-11 h-11 rounded-xl bg-primary/15 border-2 border-primary flex items-center justify-center">
                  <DotsIcon />
                </div>
                <span className="text-[10px] font-semibold text-primary">⋯ menu</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              On newer iPhones, the Share icon is hidden inside the <strong className="text-foreground">⋯</strong> dots menu.
            </p>
          </div>
        </div>

        {/* Step B */}
        <div className="border border-border rounded-2xl p-5 bg-card shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">B</div>
            <p className="font-semibold text-sm text-foreground">Scroll & tap "Add to Home Screen"</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="space-y-2">
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-border opacity-40">
                <div className="w-5 h-5 rounded bg-muted-foreground/20" />
                <span className="text-xs text-muted-foreground">Copy</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 border-2 border-primary">
                <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center">
                  <Plus className="w-3 h-3 text-primary" />
                </div>
                <span className="text-xs font-semibold text-foreground">Add to Home Screen</span>
                <span className="ml-auto text-[10px] font-bold text-primary">← Tap</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-border opacity-40">
                <div className="w-5 h-5 rounded bg-muted-foreground/20" />
                <span className="text-xs text-muted-foreground">Add to Favourites</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step C */}
        <div className="border border-border rounded-2xl p-5 bg-card shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">C</div>
            <p className="font-semibold text-sm text-foreground">Tap "Add" to confirm</p>
          </div>
          <div className="bg-muted rounded-xl p-4 border border-border">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-muted-foreground">Cancel</span>
              <span className="text-xs font-bold text-foreground">Add to Home Screen</span>
              <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg border border-primary">Add</span>
            </div>
            <div className="flex items-center gap-3 bg-card rounded-lg p-3 border border-border">
              <div className="w-10 h-10 rounded-xl overflow-hidden border border-border shadow-sm">
                <img src="/datasika-icon.png?v=2" alt="YieGo" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">YieGo</p>
                <p className="text-[10px] text-muted-foreground">yiego.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Why install? */}
      <div className="mt-8 border border-border rounded-2xl p-5 bg-card shadow-sm">
        <h3 className="font-bold text-sm text-foreground mb-4">Why install YieGo?</h3>
        <div className="space-y-3">
          {[
            { icon: Smartphone, text: 'Opens like a real app — no browser bars' },
            { icon: Zap, text: 'Faster access — just tap the icon on your Home Screen' },
            { icon: Shield, text: 'No extra download needed — works instantly' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <item.icon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm text-foreground/80">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mt-8 text-center">
        <Link to="/">
          <Button variant="outline" className="gap-2 rounded-xl h-11 px-6">
            <Globe className="w-4 h-4" />
            Go to YieGo
          </Button>
        </Link>
      </div>
    </div>
  </Layout>
);

const AppIOS = () => {
  const platform = getDevicePlatform();

  // Non-iOS devices — shouldn't be here, show generic
  if (platform !== 'ios') {
    return <SafariInstallGuide />;
  }

  // iOS but not Safari — show "Open in Safari" message
  if (!isIOSSafari()) {
    return <OpenInSafariMessage />;
  }

  // iOS + Safari — show real install steps
  return <SafariInstallGuide />;
};

export default AppIOS;