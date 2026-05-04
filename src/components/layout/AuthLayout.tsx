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
    <div className="relative min-h-screen bg-background">
      {/* Single ambient backdrop — no stacked greens */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_-10%,hsl(var(--primary)/0.12),transparent_55%)]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--foreground)/0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.6) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <AppBanner />

      <header className="relative z-10 flex items-center justify-between px-5 md:px-10 py-4">
        <Link to="/" className="inline-flex items-center group" aria-label="YieGo home">
          <Logo height="h-7" />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to site
          </Link>
          <ThemeToggle size="md" />
        </div>
      </header>

      <main className="relative z-10 grid lg:grid-cols-12 gap-10 px-5 md:px-10 pt-2 pb-16 max-w-7xl mx-auto">
        {/* Narrative panel (lg+) */}
        <aside className="hidden lg:flex lg:col-span-5 flex-col justify-between rounded-3xl border border-border/60 bg-card/50 backdrop-blur-md p-8 min-h-[560px] relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.22em] text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" /> YieGo
            </span>
            <h2 className="mt-6 text-[2.2rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
              Your everyday <br /> digital plug.
            </h2>
            <p className="mt-4 text-[14px] text-muted-foreground leading-relaxed max-w-sm">
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
              <div key={line} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-md bg-primary/15 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                </div>
                <span className="text-foreground/85">{line}</span>
              </div>
            ))}
            <div className="pt-4 mt-2 border-t border-border/60 flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Bank-grade security · Paystack-secured payments
            </div>
          </div>
        </aside>

        {/* Form column */}
        <section className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full max-w-[460px]">
            <div className="text-center lg:text-left mb-7">
              <h1 className="text-[1.7rem] md:text-[2rem] font-display font-extrabold tracking-[-0.025em] leading-[1.1]">
                {title}
              </h1>
              <p className="text-[13.5px] text-muted-foreground mt-2 leading-relaxed">{subtitle}</p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-card shadow-[0_30px_80px_-30px_hsl(var(--foreground)/0.18)] p-5 md:p-7">
              {children}
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
