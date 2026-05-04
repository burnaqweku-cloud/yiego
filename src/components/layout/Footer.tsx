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
      { to: '/dashboard', label: 'Gift Cards', soon: true },
      { to: '/dashboard', label: 'Social Boosting', soon: true },
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
      { to: '/disclaimer', label: 'Disclaimer' },
      { to: '/referral-terms', label: 'Referral Terms' },
    ],
  },
];

const Footer = () => {
  return (
    <footer className="relative z-10 pb-20 md:pb-0 border-t border-border/60 bg-gradient-to-b from-background to-card/40">
      <div className="container pt-16 pb-8">
        {/* Top: brand block + CTA */}
        <div className="grid lg:grid-cols-12 gap-10 pb-12 border-b border-border/40">
          <div className="lg:col-span-5">
            <Link to="/" className="inline-block mb-5">
              <Logo height="h-10" loading="lazy" />
            </Link>
            <h3 className="text-2xl md:text-3xl font-display font-bold tracking-tight max-w-md leading-[1.15]">
              One wallet. Every digital service. <span className="text-gradient">Built for Ghana.</span>
            </h3>
            <p className="text-sm text-muted-foreground mt-4 max-w-md leading-relaxed">
              YieGo is your everyday digital plug — data, airtime, bills, gift cards and more, in one secure account.
            </p>
            <div className="flex gap-2 mt-6">
              <Link to="/auth?tab=signup" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                Create account <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link to="/support" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-muted/60 transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> Talk to us
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-8">
            {linkGroups.map((group) => (
              <div key={group.title}>
                <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80 mb-4">{group.title}</h4>
                <ul className="space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link to={link.to} className="text-sm text-foreground/75 hover:text-primary transition-colors inline-flex items-center gap-1.5">
                        {link.label}
                        {(link as any).soon && <span className="text-[8px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-muted text-muted-foreground/70">Soon</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: legal bar */}
        <div className="pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 text-xs text-muted-foreground/70">
            <span>© {new Date().getFullYear()} YieGo</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <a href="mailto:support@yiego.com" className="inline-flex items-center gap-1 hover:text-primary transition-colors">
              <Mail className="w-3 h-3" /> support@yiego.com
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground/60">
            Crafted by{' '}
            <a href="https://jjsolutionsdigital.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary underline-offset-2 hover:underline">JJ Solutions</a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
