import Layout from '@/components/layout/Layout';
import { Smartphone, ShieldCheck, Bell, Zap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const PERKS = [
  { icon: Zap, title: 'Faster checkout', desc: 'Open YieGo from your home screen — no browser bars in the way.' },
  { icon: Bell, title: 'Stay updated', desc: 'Get gentle nudges on order delivery and wallet activity.' },
  { icon: ShieldCheck, title: 'Same secure platform', desc: 'Bank-grade payments via Paystack, encrypted wallet.' },
];

const AppAndroid = () => {
  return (
    <Layout>
      <div className="container py-8 md:py-12 max-w-lg mx-auto px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">YieGo for Android</span>
          </div>
          <div className="w-20 h-20 rounded-[1.4rem] mx-auto mb-5 overflow-hidden ring-1 ring-border/60 shadow-md">
            <img src="/yiego-icon.png?v=2" alt="YieGo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl md:text-[1.75rem] font-display font-extrabold tracking-tight">Install YieGo</h1>
          <p className="text-[14px] text-muted-foreground mt-2 leading-relaxed max-w-md mx-auto">
            Add YieGo to your home screen for the fastest experience. The dedicated Android app is launching soon.
          </p>
        </div>

        {/* Coming-soon download card */}
        <div className="rounded-3xl border border-border/70 bg-card p-5 md:p-6 mb-6 shadow-[0_20px_50px_-30px_hsl(var(--primary)/0.25)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">YieGo Android App</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Launching soon
                </p>
              </div>
            </div>
            <span className="text-[9.5px] uppercase tracking-wider font-bold px-2 py-1 rounded-md bg-muted text-muted-foreground">v1 prep</span>
          </div>
          <Button
            disabled
            className="w-full h-12 rounded-xl font-bold text-[14px] gap-2 cursor-not-allowed opacity-90"
          >
            Download — Coming soon
          </Button>
          <p className="text-[11px] text-muted-foreground text-center mt-3 leading-relaxed">
            We'll publish the APK here once it's ready. In the meantime, install YieGo as a web app — it works offline-ready and feels native.
          </p>
        </div>

        {/* Add to home (PWA) */}
        <div className="rounded-3xl border border-border/70 bg-card p-5 md:p-6 mb-6">
          <h2 className="text-[15px] font-display font-bold mb-4">Get the YieGo experience now</h2>
          <ol className="space-y-3">
            {[
              'Open YieGo in Chrome.',
              'Tap the ⋮ menu in the top-right corner.',
              'Choose "Install app" or "Add to Home screen".',
              'Confirm — YieGo will appear like any other app.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-lg bg-primary text-primary-foreground text-[12px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-[13.5px] text-foreground/85 leading-relaxed pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Why */}
        <div className="rounded-3xl border border-border/70 bg-card p-5 md:p-6 mb-6">
          <h3 className="text-[15px] font-display font-bold mb-4">Why install?</h3>
          <div className="space-y-3">
            {PERKS.map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                  <p.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[13.5px] font-semibold leading-tight">{p.title}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Link to="/" className="flex-1">
            <Button variant="outline" className="w-full rounded-xl h-11">Back to YieGo</Button>
          </Link>
          <Link to="/buy-data" className="flex-1">
            <Button className="w-full rounded-xl h-11 font-semibold">Buy data instead</Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default AppAndroid;
