import { Link } from 'react-router-dom';
import Logo from '@/components/layout/Logo';

const Footer = () => {
  return (
    <footer className="bg-muted/40 dark:bg-[hsl(160_26%_4%)] border-t border-border relative z-10 pb-20 md:pb-0">
      <div className="container py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-10">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="inline-block mb-4 group">
              <Logo height="h-10" loading="lazy" className="opacity-90 group-hover:opacity-100 transition-opacity" />
            </Link>
            <p className="text-muted-foreground/70 text-xs leading-relaxed max-w-[230px]">
              Your everyday digital plug. Data, airtime, bills, gift cards, boosting and more — built into one simple YieGo account.
            </p>
            <p className="text-[10px] text-primary/80 font-bold tracking-widest uppercase mt-3">Built for Ghana &amp; Africa</p>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-5 text-[11px] uppercase tracking-widest text-muted-foreground/60">Services</h4>
            <ul className="space-y-3">
              {[
                { to: '/buy-data', label: 'Data Bundles' },
                { to: '/dashboard', label: 'Airtime' },
                { to: '/dashboard', label: 'Bill Payments' },
                { to: '/dashboard', label: 'Gift Cards' },
                { to: '/dashboard', label: 'Social Boosting' },
              ].map((link, i) => (
                <li key={i}>
                  <Link to={link.to} className="text-sm text-muted-foreground/75 hover:text-primary transition-colors duration-150">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-5 text-[11px] uppercase tracking-widest text-muted-foreground/60">Account</h4>
            <ul className="space-y-3">
              <li><Link to="/dashboard" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors">Dashboard</Link></li>
              <li><Link to="/dashboard/wallet" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors">Wallet</Link></li>
              <li><Link to="/dashboard/orders" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors">Orders</Link></li>
              <li><Link to="/track-order" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors">Track an Order</Link></li>
              <li><Link to="/become-an-agent" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors">Become an Agent</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-5 text-[11px] uppercase tracking-widest text-muted-foreground/60">Company</h4>
            <ul className="space-y-3">
              <li><Link to="/blog" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors">Blog</Link></li>
              <li><Link to="/faq" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors">FAQs</Link></li>
              <li><Link to="/support" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors">Support</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-5 text-[11px] uppercase tracking-widest text-muted-foreground/60">Help</h4>
            <ul className="space-y-3">
              <li>
                <a href="mailto:support@yiego.com" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors duration-150">
                  support@yiego.com
                </a>
              </li>
              <li>
                <Link to="/support" className="text-sm text-muted-foreground/75 hover:text-primary transition-colors duration-150">
                  Get Help
                </Link>
              </li>
              <li className="text-xs text-muted-foreground/50 leading-relaxed">
                Need help with an order? Send your order reference so our team can check it faster.
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-6 flex flex-col md:flex-row justify-between items-center gap-3">
          <p className="text-xs text-muted-foreground/60">© YieGo {new Date().getFullYear()} — Your everyday digital plug. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/terms" className="text-xs text-muted-foreground/50 hover:text-primary transition-colors">Terms</Link>
            <Link to="/privacy" className="text-xs text-muted-foreground/50 hover:text-primary transition-colors">Privacy</Link>
            <Link to="/disclaimer" className="text-xs text-muted-foreground/50 hover:text-primary transition-colors">Disclaimer</Link>
          </div>
        </div>

        <div className="border-t border-border/30 mt-6 pt-5 text-center">
          <p className="text-[11px] text-muted-foreground/50 tracking-wide">
            Powered by{' '}
            <a href="https://jjsolutionsdigital.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors hover:underline underline-offset-2">
              JJ Solutions
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
