import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, LogOut, Shield, LayoutDashboard, Smartphone, Receipt,
  Sparkles, ArrowRight, LifeBuoy, ChevronDown, Tv, Search, PackageSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import Logo from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const PRIMARY_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/buy-data', label: 'Buy Data' },
  { to: '/track-order', label: 'Track' },
  { to: '/blog', label: 'Blog' },
];

// NOTE: Gift Cards intentionally hidden from public surfaces (deferred).
const SERVICES = [
  { to: '/buy-data', label: 'Data Bundles', icon: Smartphone, status: 'Live', desc: 'MTN, Telecel, AirtelTigo' },
  { to: '/dashboard', label: 'Airtime', icon: Sparkles, status: 'Soon', desc: 'Top up any line instantly' },
  { to: '/dashboard', label: 'Bill Payments', icon: Receipt, status: 'Soon', desc: 'ECG, water, TV & more' },
  { to: '/dashboard', label: 'Subscriptions', icon: Tv, status: 'Soon', desc: 'Netflix, Spotify & more' },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setIsOpen(false); setServicesOpen(false); }, [location.pathname]);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-background/75 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.12)]'
          : 'bg-transparent'
      }`}
    >
      {/* Gradient hairline that appears on scroll */}
      <div
        className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent transition-opacity duration-300 ${
          scrolled ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <nav className="container flex items-center justify-between h-14">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0 group" aria-label="YieGo home">
          <Logo height="h-7" className="transition-transform duration-200 group-hover:scale-[1.04]" />
        </Link>

        {/* Desktop nav (centered, sleek) */}
        <div className="hidden lg:flex items-center absolute left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card/70 backdrop-blur-xl backdrop-saturate-150 px-1 py-1 shadow-[0_4px_24px_-12px_hsl(var(--primary)/0.18)]">
            {PRIMARY_LINKS.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`relative px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-200 ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="relative">
              <button
                onClick={() => setServicesOpen((v) => !v)}
                onBlur={() => setTimeout(() => setServicesOpen(false), 150)}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              >
                Services
                <ChevronDown className={`w-3 h-3 transition-transform ${servicesOpen ? 'rotate-180' : ''}`} />
              </button>
              {servicesOpen && (
                <div className="absolute right-1/2 translate-x-1/2 top-[calc(100%+10px)] w-[340px] rounded-2xl border border-border/70 bg-popover/95 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_60px_-20px_hsl(var(--primary)/0.3),0_8px_24px_-8px_hsl(0_0%_0%/0.15)] overflow-hidden animate-page-in">
                  {/* gradient top edge */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                  <div className="p-1.5">
                    {SERVICES.map((s) => (
                      <Link
                        key={s.label}
                        to={s.to}
                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-primary/5 transition-colors group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/15 flex items-center justify-center shrink-0 group-hover:ring-primary/30 transition-all">
                          <s.icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[13px]">{s.label}</span>
                            <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${s.status === 'Live' ? 'bg-primary/15 text-primary border border-primary/25' : 'bg-muted text-muted-foreground'}`}>{s.status}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-primary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right cluster */}
        <div className="hidden lg:flex items-center gap-1.5">
          <Link to="/support" className="w-9 h-9 rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center justify-center" aria-label="Support">
            <LifeBuoy className="w-4 h-4" />
          </Link>
          <ThemeToggle size="md" />
          {user ? (
            <>
              <Link to="/dashboard">
                <Button size="sm" className="rounded-full font-semibold gap-1.5 px-4 h-9">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Dashboard
                </Button>
              </Link>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outline" size="sm" className="rounded-full gap-1.5 h-9 w-9 p-0">
                    <Shield className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="sm" className="rounded-full h-9 w-9 p-0" onClick={handleSignOut} aria-label="Sign out">
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth"><Button variant="ghost" size="sm" className="rounded-full font-medium h-9">Sign in</Button></Link>
              <Link to="/auth?tab=signup">
                <Button size="sm" className="rounded-full font-semibold px-4 h-9 gap-1.5 shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.55)] hover:shadow-[0_10px_24px_-8px_hsl(var(--primary)/0.65)] hover:-translate-y-0.5 transition-all">
                  Get started
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile right cluster */}
        <div className="lg:hidden flex items-center gap-1.5">
          <ThemeToggle size="sm" />
          <button
            onClick={() => setIsOpen(true)}
            className="w-9 h-9 rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-foreground/80 hover:text-foreground hover:border-primary/40 transition-all flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Mobile fullscreen drawer */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] bg-background/98 backdrop-blur-xl animate-page-in flex flex-col">
          {/* Header bar */}
          <div className="flex items-center justify-between h-14 container border-b border-border/60 shrink-0">
            <Logo height="h-7" />
            <button
              onClick={() => setIsOpen(false)}
              className="w-9 h-9 rounded-full border border-border/70 bg-card/70 text-foreground/80 hover:border-primary/40 transition-all flex items-center justify-center"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="container py-5 overflow-y-auto flex-1 pb-24">
            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              <Link to="/buy-data" onClick={() => setIsOpen(false)} className="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl bg-primary text-primary-foreground active:scale-[0.98] transition-transform shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.5)]">
                <Smartphone className="w-4 h-4" />
                <span className="text-[13px] font-semibold">Buy data</span>
              </Link>
              <Link to="/track-order" onClick={() => setIsOpen(false)} className="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl border border-border bg-card active:scale-[0.98] transition-transform">
                <PackageSearch className="w-4 h-4" />
                <span className="text-[13px] font-semibold">Track order</span>
              </Link>
            </div>

            {/* Navigation */}
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70 mb-2 px-1">Navigate</p>
            <div className="space-y-0.5 mb-6">
              {PRIMARY_LINKS.concat([{ to: '/support', label: 'Support' }, { to: '/faq', label: 'FAQ' }]).map((link) => {
                const active = location.pathname === link.to;
                return (
                  <Link
                    key={link.to + link.label}
                    to={link.to}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${active ? 'bg-muted/70 text-foreground' : 'hover:bg-muted/40 text-foreground/85'}`}
                  >
                    <span className="text-[14px] font-medium">{link.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                  </Link>
                );
              })}
            </div>

            {/* Services preview */}
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70 mb-2 px-1">Services</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {SERVICES.map((s) => (
                <Link
                  key={s.label}
                  to={s.to}
                  onClick={() => setIsOpen(false)}
                  className="p-3.5 rounded-2xl border border-border/70 bg-card/60 hover:border-primary/40 active:scale-[0.97] transition-all"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <s.icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className={`text-[8.5px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${s.status === 'Live' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground/80'}`}>{s.status}</span>
                  </div>
                  <div className="text-[12.5px] font-semibold leading-snug">{s.label}</div>
                </Link>
              ))}
            </div>

            {/* Auth */}
            <div className="space-y-2 pt-4 border-t border-border/60">
              {user ? (
                <>
                  <Link to="/dashboard" onClick={() => setIsOpen(false)}>
                    <Button className="w-full rounded-xl font-semibold gap-1.5 h-12">
                      <LayoutDashboard className="w-4 h-4" /> My Dashboard
                    </Button>
                  </Link>
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setIsOpen(false)}>
                      <Button variant="outline" className="w-full rounded-xl gap-1.5 h-12">
                        <Shield className="w-4 h-4" /> Admin Panel
                      </Button>
                    </Link>
                  )}
                  <Button variant="ghost" className="w-full rounded-xl gap-1.5 h-12" onClick={handleSignOut}>
                    <LogOut className="w-4 h-4" /> Sign out
                  </Button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/auth" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full rounded-xl h-12 font-semibold">Sign in</Button>
                  </Link>
                  <Link to="/auth?tab=signup" onClick={() => setIsOpen(false)}>
                    <Button className="w-full rounded-xl h-12 font-semibold">Get started</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
