import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, Wallet, Sparkles } from 'lucide-react';
import AppBanner from './AppBanner';
import { ThemeToggle } from './ThemeToggle';
import Logo from './Logo';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

/**
 * Split-screen auth layout — brand panel left, form right.
 * Mobile collapses to single column with compact brand strip.
 */
const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen bg-background relative">
      <AppBanner />

      <div className="grid lg:grid-cols-[1.05fr_1fr] min-h-screen">
        {/* LEFT — brand panel */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 bg-gradient-to-br from-card via-background to-card text-foreground border-r border-border">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute bottom-10 right-10 w-72 h-72 rounded-full bg-accent/15 blur-3xl" />
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
            />
          </div>

          <Link to="/" className="inline-flex items-center group" aria-label="YieGo Home">
            <Logo height="h-10" className="transition-transform group-hover:scale-[1.03]" />
          </Link>

          <div className="max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-primary">
              <Sparkles className="w-3 h-3" /> The YieGo wallet
            </span>
            <h2 className="text-4xl font-display font-extrabold tracking-[-0.03em] leading-[1.1] mt-5">
              One wallet. <br /> Every digital <br /> service. <span className="text-gradient">Instant.</span>
            </h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              Sign in to manage your wallet, place orders, track deliveries and unlock new services as they go live.
            </p>

            <div className="grid grid-cols-3 gap-3 mt-8">
              {[
                { icon: Wallet, label: 'Wallet' },
                { icon: Zap, label: 'Instant' },
                { icon: ShieldCheck, label: 'Secure' },
              ].map((b) => (
                <div key={b.label} className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-3 text-center">
                  <b.icon className="w-4 h-4 text-primary mx-auto mb-1.5" />
                  <span className="text-[11px] font-semibold">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground/70">© {new Date().getFullYear()} YieGo · Built for Ghana 🇬🇭</p>
        </aside>

        {/* RIGHT — form panel */}
        <main className="relative flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 lg:px-10 py-4 border-b border-border/50 lg:border-transparent">
            <Link to="/" className="lg:hidden inline-flex items-center" aria-label="YieGo Home">
              <Logo height="h-8" />
            </Link>
            <div className="lg:ml-auto flex items-center gap-3">
              <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back to site</Link>
              <ThemeToggle size="sm" />
            </div>
          </div>

          <div className="flex-1 flex items-start lg:items-center justify-center px-5 py-10 lg:px-10">
            <div className="w-full max-w-[440px]">
              <div className="mb-7">
                <h1 className="text-2xl md:text-[1.75rem] font-display font-extrabold tracking-[-0.02em]">{title}</h1>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{subtitle}</p>
              </div>
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AuthLayout;
