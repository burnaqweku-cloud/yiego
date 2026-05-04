import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Plus, Smartphone, Globe, Zap, Shield, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDevicePlatform, isIOSSafari } from '@/hooks/useDeviceDetect';

const ShareIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
    <rect x="4" y="8" width="16" height="14" rx="2" />
    <polyline points="8 8 12 3 16 8" />
    <line x1="12" y1="3" x2="12" y2="16" />
  </svg>
);

const OpenInSafariMessage = () => (
  <Layout>
    <div className="container py-12 max-w-md mx-auto px-4 text-center">
      <div className="w-20 h-20 rounded-[1.4rem] mx-auto mb-5 overflow-hidden ring-1 ring-border/60 shadow-md">
        <img src="/yiego-icon.png?v=2" alt="YieGo" className="w-full h-full object-cover" />
      </div>
      <h1 className="text-[1.75rem] font-display font-extrabold mb-2">Open in Safari</h1>
      <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
        To install YieGo on your iPhone, please open this page in <strong className="text-foreground">Safari</strong>.
      </p>
      <div className="rounded-3xl border border-border/70 bg-card p-5 mb-6 text-left">
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Tap the <strong className="text-foreground">Share</strong> button in your current browser, then choose <strong className="text-foreground">"Open in Safari"</strong>, or copy and paste this link into Safari:
        </p>
        <div className="mt-3 flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5 border border-border">
          <span className="text-xs text-foreground font-mono truncate flex-1">yiego.com/app/ios</span>
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="text-xs text-primary font-bold shrink-0"
          >
            Copy
          </button>
        </div>
      </div>
      <Link to="/">
        <Button variant="outline" className="gap-2 rounded-xl h-11 px-6">
          <Globe className="w-4 h-4" /> Go to YieGo
        </Button>
      </Link>
    </div>
  </Layout>
);

const SafariInstallGuide = () => (
  <Layout>
    <div className="container py-8 md:py-12 max-w-lg mx-auto px-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">YieGo for iPhone</span>
        </div>
        <div className="w-20 h-20 rounded-[1.4rem] mx-auto mb-5 overflow-hidden ring-1 ring-border/60 shadow-md">
          <img src="/yiego-icon.png?v=2" alt="YieGo" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-2xl md:text-[1.75rem] font-display font-extrabold tracking-tight">Add YieGo to your home screen</h1>
        <p className="text-[14px] text-muted-foreground mt-2 leading-relaxed">
          Three quick taps in Safari and YieGo opens like a native app — no app store needed.
        </p>
      </div>

      <div className="space-y-3">
        {[
          {
            step: '1',
            title: 'Tap the Share button',
            body: (
              <div className="flex items-center justify-center gap-3 mt-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 ring-1 ring-primary/30 flex items-center justify-center">
                  <ShareIcon />
                </div>
                <span className="text-[12px] text-muted-foreground">at the bottom of Safari</span>
              </div>
            ),
          },
          {
            step: '2',
            title: 'Choose "Add to Home Screen"',
            body: (
              <div className="mt-3 flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/8 border border-primary/30">
                <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                <span className="text-[13px] font-semibold">Add to Home Screen</span>
              </div>
            ),
          },
          {
            step: '3',
            title: 'Tap "Add" to confirm',
            body: (
              <div className="mt-3 flex items-center gap-3 bg-card rounded-lg p-3 border border-border">
                <div className="w-9 h-9 rounded-xl overflow-hidden ring-1 ring-border">
                  <img src="/yiego-icon.png?v=2" alt="YieGo" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold">YieGo</p>
                  <p className="text-[10.5px] text-muted-foreground">yiego.com</p>
                </div>
                <span className="text-[11px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-md border border-primary/30">Add</span>
              </div>
            ),
          },
        ].map((s) => (
          <div key={s.step} className="rounded-3xl border border-border/70 bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground text-[13px] font-bold flex items-center justify-center">
                {s.step}
              </span>
              <p className="text-[14px] font-display font-bold">{s.title}</p>
            </div>
            {s.body}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-5">
        <h3 className="text-[14px] font-display font-bold mb-3">Why install?</h3>
        <div className="space-y-2.5">
          {[
            { icon: Smartphone, text: 'Opens like a real app — no browser bars' },
            { icon: Zap, text: 'Faster access — one tap from home screen' },
            { icon: Bell, text: 'Order updates without keeping the tab open' },
            { icon: Shield, text: 'Same secure YieGo experience' },
          ].map((p, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <p.icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] text-foreground/85">{p.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link to="/">
          <Button variant="outline" className="gap-2 rounded-xl h-11 px-6">
            <Globe className="w-4 h-4" /> Back to YieGo
          </Button>
        </Link>
      </div>
    </div>
  </Layout>
);

const AppIOS = () => {
  const platform = getDevicePlatform();
  if (platform !== 'ios') return <SafariInstallGuide />;
  if (!isIOSSafari()) return <OpenInSafariMessage />;
  return <SafariInstallGuide />;
};

export default AppIOS;
