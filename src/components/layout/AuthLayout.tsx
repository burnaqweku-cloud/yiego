import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import AppBanner from './AppBanner';
import { ThemeToggle } from './ThemeToggle';
import Logo from './Logo';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

/**
 * Auth canvas — bold split with a tall narrative panel on the left and a
 * focused form column on the right. Single ambient glow (no stacked greens).
 */
const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* Ambient backdrop — drifting indigo + accent + grid + noise */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -right-16 w-[640px] h-[640px] rounded-full bg-primary/20 blur-3xl glow-drift" />
        <div className="absolute -bottom-32 -left-16 w-[520px] h-[520px] rounded-full bg-accent/12 blur-3xl glow-drift-slow" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)/0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.6) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
        <div className="noise-overlay" />
      </div>

      <AppBanner />

      <header className="relative z-10 flex items-center justify-between px-5 md:px-10 py-4">
        <Link to="/" className="inline-flex items-center group" aria-label="YieGo home">
          <Logo height="h-7" className="transition-transform duration-300 group-hover:scale-[1.04]" />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to site
          </Link>
          <ThemeToggle size="md" />
        </div>
      </header>

      <main className="relative z-10 grid lg:grid-cols-12 gap-10 px-5 md:px-10 pt-2 pb-16 max-w-7xl mx-auto">
        {/* Narrative panel (lg+) */}
        <aside className="hidden lg:flex lg:col-span-5 flex-col justify-between rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl p-8 min-h-[560px] relative overflow-hidden shadow-[0_30px_80px_-30px_hsl(var(--primary)/0.3)]">
          {/* gradient top hairline */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="absolute -top-24 -left-20 w-80 h-80 rounded-full bg-primary/15 blur-3xl glow-drift-slow" />
          <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-accent/10 blur-3xl" />
          <div className="noise-overlay" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 mb-6">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">YieGo</span>
            </div>
            <h2 className="text-[2.4rem] font-display font-extrabold tracking-[-0.03em] leading-[1.02]">
              Your everyday <br /> <span className="text-gradient">digital plug.</span>
            </h2>
            <p className="mt-5 text-[14px] text-muted-foreground leading-relaxed max-w-sm">
              One account for data, airtime, bills, subscriptions and more — built for how Ghana
              actually spends online.
            </p>
          </div>
          <div className="relative space-y-3 text-[13px]">
            {[
              'One wallet, every service',
              'Pay with MoMo, card or your wallet',
              'Track every order from start to delivery',
            ].map((line) => (
              <div key={line} className="flex items-center gap-3 group">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.35)] group-hover:scale-110 transition-transform">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
                <span className="text-foreground/90 font-medium">{line}</span>
              </div>
            ))}
            <div className="pt-5 mt-3 border-t border-border/60 flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Bank-grade security · Paystack-secured payments
            </div>
          </div>
        </aside>

        {/* Form column */}
        <section className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full max-w-[460px]">
            <div className="text-center lg:text-left mb-7">
              <h1 className="text-[1.8rem] md:text-[2.2rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
                {title}
              </h1>
              <p className="text-[13.5px] text-muted-foreground mt-2.5 leading-relaxed">{subtitle}</p>
            </div>
            <div className="relative rounded-3xl border border-border/70 bg-card backdrop-blur-xl shadow-[0_30px_80px_-30px_hsl(var(--primary)/0.35)] p-5 md:p-7 overflow-hidden">
              {/* gradient top hairline */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
              <div className="relative">{children}</div>
            </div>
            <p className="text-center text-[11px] text-muted-foreground/70 mt-6">
              © {new Date().getFullYear()} YieGo · Built for Ghana 🇬🇭
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AuthLayout;
