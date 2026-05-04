import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, Wallet, ArrowLeft } from 'lucide-react';
import AppBanner from './AppBanner';
import { ThemeToggle } from './ThemeToggle';
import Logo from './Logo';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

/**
 * YieGo auth layout — single centered "card on canvas" composition.
 * Distinct from a traditional split-screen: a textured ambient canvas with
 * a floating editorial card stack and trust rail below.
 */
const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      {/* Ambient backdrop layers */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-card/40" />
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[460px] h-[460px] rounded-full bg-accent/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
      </div>

      <AppBanner />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 md:px-10 py-4">
        <Link to="/" className="inline-flex items-center group" aria-label="YieGo home">
          <Logo height="h-7" className="transition-transform group-hover:scale-[1.04]" />
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

      {/* Main canvas */}
      <main className="relative z-10 flex flex-col items-center px-5 pt-6 pb-16">
        {/* Eyebrow strip */}
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-primary">YieGo Wallet</span>
        </div>

        {/* Headline */}
        <div className="text-center max-w-md mb-7 px-2">
          <h1 className="text-[1.7rem] md:text-[2.1rem] font-display font-extrabold tracking-[-0.025em] leading-[1.1]">
            {title}
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-2.5 leading-relaxed">{subtitle}</p>
        </div>

        {/* Card stack */}
        <div className="w-full max-w-[440px]">
          {/* Floating accent ribbon (decoration above card) */}
          <div className="relative h-2 mx-6 rounded-t-2xl bg-gradient-to-r from-primary/40 via-primary/70 to-primary/40 opacity-60" />
          <div className="relative h-1 mx-10 rounded-t-2xl bg-primary/40 -mt-px" />

          {/* The card */}
          <div className="relative rounded-3xl border border-border/70 bg-card/95 backdrop-blur-xl shadow-[0_30px_80px_-20px_hsl(var(--foreground)/0.25),0_10px_30px_-10px_hsl(var(--primary)/0.15)] p-5 md:p-7">
            {children}
          </div>

          {/* Trust rail */}
          <div className="mt-6 grid grid-cols-3 gap-2">
            {[
              { icon: Wallet, label: 'One wallet' },
              { icon: Zap, label: 'Instant orders' },
              { icon: ShieldCheck, label: 'Bank-grade security' },
            ].map((b) => (
              <div
                key={b.label}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm py-3 px-2 text-center"
              >
                <b.icon className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10.5px] font-semibold text-foreground/80 leading-tight">{b.label}</span>
              </div>
            ))}
          </div>

          {/* Footer line */}
          <p className="text-center text-[11px] text-muted-foreground/70 mt-6">
            © {new Date().getFullYear()} YieGo · Built for Ghana 🇬🇭
          </p>
        </div>
      </main>
    </div>
  );
};

export default AuthLayout;
