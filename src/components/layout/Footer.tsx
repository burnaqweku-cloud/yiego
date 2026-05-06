import { Link } from 'react-router-dom';
import { ArrowUpRight, Mail, MessageCircle } from 'lucide-react';
import Logo from '@/components/layout/Logo';

const linkGroups = [
  {
    title: 'Services',
    links: [
      { to: '/buy-data', label: 'Data Bundles' },
      { to: '/dashboard', label: 'Airtime', soon: true },
      { to: '/dashboard', label: 'Bill Payments', soon: true },
      { to: '/dashboard', label: 'Subscriptions', soon: true },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/dashboard/wallet', label: 'Wallet' },
      { to: '/dashboard/orders', label: 'My Orders' },
      { to: '/track-order', label: 'Track Order' },
    ],
  },
  {
    title: 'Help',
    links: [
      { to: '/support', label: 'Support Center' },
      { to: '/faq', label: 'FAQ' },
      { to: '/blog', label: 'Blog' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/terms', label: 'Terms of Service' },
      { to: '/privacy', label: 'Privacy Policy' },
    ],
  },
];

const Footer = () => {
  return (
    <footer className="relative z-10 pb-20 md:pb-0 bg-gradient-to-b from-background to-card/60 overflow-hidden">
      {/* Gradient top edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      {/* Ambient decorative layers */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[300px] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute bottom-0 right-[-10%] w-[400px] h-[400px] rounded-full bg-accent/[0.05] blur-3xl" />
        <div className="noise-overlay" />
      </div>

      <div className="container pt-20 pb-8 relative">
        <div className="grid lg:grid-cols-12 gap-10 pb-12 border-b border-border/40">
          <div className="lg:col-span-5">
            <Link to="/" className="inline-block mb-6 group">
              <Logo height="h-9" loading="lazy" className="transition-transform duration-300 group-hover:scale-[1.04]" />
            </Link>
            <h3 className="text-[1.65rem] md:text-[2rem] font-display font-extrabold tracking-[-0.025em] max-w-md leading-[1.08]">
              One wallet. Every digital service.{' '}
              <span className="text-gradient">Built for Ghana.</span>
            </h3>
            <p className="text-[13.5px] text-muted-foreground mt-4 max-w-md leading-relaxed">
              YieGo is your everyday digital plug — data, airtime, bills and more in one secure account.
            </p>
            <div className="flex flex-wrap gap-2 mt-7">
              <Link
                to="/auth?tab=signup"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-[0_10px_28px_-10px_hsl(var(--primary)/0.6)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-10px_hsl(var(--primary)/0.7)] transition-all"
              >
                Create account <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                to="/support"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-border bg-background/40 backdrop-blur-sm text-sm font-medium hover:bg-card/80 hover:border-primary/30 transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Talk to us
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
            {linkGroups.map((group) => (
              <div key={group.title}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-1 h-1 rounded-full bg-primary" />
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">{group.title}</h4>
                </div>
                <ul className="space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-[13px] text-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-1.5 group"
                      >
                        <span className="relative">
                          {link.label}
                          <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                        </span>
                        {(link as any).soon && (
                          <span className="text-[8.5px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-muted text-muted-foreground/70">Soon</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground/80">
            <span>© {new Date().getFullYear()} YieGo</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <a href="mailto:support@yiego.com" className="inline-flex items-center gap-1.5 hover:text-primary transition-colors">
              <Mail className="w-3 h-3" /> support@yiego.com
            </a>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-card/50 backdrop-blur-sm">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-success" />
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">All systems operating in Ghana 🇬🇭</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
