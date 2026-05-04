import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Shield, LayoutDashboard, Smartphone, Receipt, Gift, Sparkles, ChevronDown, ArrowRight, LifeBuoy, BookOpen, Search } from 'lucide-react';
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

const SERVICES = [
  { to: '/buy-data', label: 'Data Bundles', icon: Smartphone, status: 'Live', desc: 'MTN, Telecel, AirtelTigo' },
  { to: '/dashboard', label: 'Airtime', icon: Sparkles, status: 'Soon', desc: 'Top up any line instantly' },
  { to: '/dashboard', label: 'Bill Payments', icon: Receipt, status: 'Soon', desc: 'ECG, water, TV & more' },
  { to: '/dashboard', label: 'Gift Cards', icon: Gift, status: 'Soon', desc: 'Global digital vouchers' },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setIsOpen(false); setServicesOpen(false); }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-background/85 backdrop-blur-xl border-b border-border/60' : 'bg-transparent'}`}>
      <nav className="container flex items-center justify-between h-[68px]">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0 group">
          <Logo height="h-9" className="transition-transform duration-200 group-hover:scale-[1.03]" />
        </Link>

        {/* Desktop pill nav */}
        <div className="hidden lg:flex items-center">
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/60 backdrop-blur-md px-1.5 py-1.5 shadow-sm">
            {PRIMARY_LINKS.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.5)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {/* Services mega-dropdown */}
            <div className="relative">
              <button
                onClick={() => setServicesOpen((v) => !v)}
                onBlur={() => setTimeout(() => setServicesOpen(false), 150)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Services
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${servicesOpen ? 'rotate-180' : ''}`} />
              </button>
              {servicesOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] w-[360px] rounded-2xl border border-border bg-popover shadow-2xl p-2 animate-page-in">
                  {SERVICES.map((s) => (
                    <Link
                      key={s.label}
                      to={s.to}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <s.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{s.label}</span>
                          <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${s.status === 'Live' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{s.status}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{s.desc}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right cluster */}
        <div className="hidden lg:flex items-center gap-2">
          <Link to="/support" className="p-2 rounded-full hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors" aria-label="Support">
            <LifeBuoy className="w-4 h-4" />
          </Link>
          <ThemeToggle size="sm" />
          {user ? (
            <>
              <Link to="/dashboard">
                <Button size="sm" className="rounded-full font-semibold gap-1.5 px-4">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Dashboard
                </Button>
              </Link>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="sm" className="rounded-full" onClick={handleSignOut} aria-label="Sign out">
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth"><Button variant="ghost" size="sm" className="rounded-full font-medium">Sign in</Button></Link>
              <Link to="/auth?tab=signup">
                <Button size="sm" className="rounded-full font-semibold px-5 gap-1.5">
                  Get started
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile right */}
        <div className="lg:hidden flex items-center gap-1">
          <ThemeToggle size="sm" />
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 rounded-full hover:bg-muted/60 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* Mobile fullscreen drawer */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] bg-background animate-page-in">
          <div className="flex items-center justify-between h-[68px] container border-b border-border/60">
            <Logo height="h-9" />
            <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-muted/60" aria-label="Close menu">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="container py-6 overflow-y-auto h-[calc(100vh-68px)] pb-32">
            {/* Search-like CTA */}
            <Link to="/buy-data" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted/50 border border-border/60 mb-6 active:scale-[0.98] transition-transform">
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Buy data, airtime, gift cards…</span>
            </Link>

            {/* Services grid */}
            <div className="mb-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3">Services</p>
              <div className="grid grid-cols-2 gap-2.5">
                {SERVICES.map((s) => (
                  <Link key={s.label} to={s.to} onClick={() => setIsOpen(false)} className="p-4 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors active:scale-[0.97]">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                      <s.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-sm font-semibold">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{s.status === 'Live' ? '✓ Available' : 'Coming soon'}</div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Browse */}
            <div className="mb-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3">Browse</p>
              <div className="space-y-1">
                {PRIMARY_LINKS.concat([{ to: '/support', label: 'Support' }, { to: '/faq', label: 'FAQ' }]).map((link) => (
                  <Link key={link.to + link.label} to={link.to} onClick={() => setIsOpen(false)} className="flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium">{link.label}</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Auth */}
            <div className="space-y-2 pt-2 border-t border-border/60">
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
