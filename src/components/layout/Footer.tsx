import { Link } from 'react-router-dom';
import Logo from '@/components/layout/Logo';

const Footer = () => {
  return (
    <footer className="bg-muted/50 dark:bg-[hsl(224_44%_7%)] border-t border-border relative z-10 pb-20 md:pb-0">
      <div className="container py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="inline-block mb-4 group">
              <Logo height="h-10" loading="lazy" className="opacity-80 group-hover:opacity-100 transition-opacity" />
            </Link>
            <p className="text-muted-foreground/60 text-xs leading-relaxed max-w-[220px]">
              Ghana's cheapest data bundles. Buy MTN, Telecel & AirtelTigo data online — usually delivered within a few minutes.
            </p>
            <p className="text-[10px] text-primary/70 font-bold tracking-widest uppercase mt-3">Cheap Data, Ghana</p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold mb-5 text-[11px] uppercase tracking-widest text-muted-foreground/50">Quick Links</h4>
            <ul className="space-y-3">
              {[
                { to: '/buy-data', label: 'Buy Data' },
                { to: '/track-order', label: 'Track Order' },
                { to: '/become-an-agent', label: 'Become a Reseller' },
                { to: '/blog', label: 'Blog' },
                { to: '/faq', label: 'FAQ' },
              ].map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-muted-foreground/70 hover:text-primary transition-colors duration-150">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Networks */}
          <div>
            <h4 className="font-display font-semibold mb-5 text-[11px] uppercase tracking-widest text-muted-foreground/50">Networks</h4>
            <ul className="space-y-3">
              <li><Link to="/mtn-data-bundles-ghana" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors">MTN Data Bundles</Link></li>
              <li><Link to="/telecel-data-bundles-ghana" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors">Telecel Data Bundles</Link></li>
              <li><Link to="/airteltigo-data-bundles-ghana" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors">AirtelTigo Data Bundles</Link></li>
              <li><Link to="/cheapest-data-bundles-ghana" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors">Cheapest Data Bundles</Link></li>
            </ul>
          </div>

          {/* Buy Data */}
          <div>
            <h4 className="font-display font-semibold mb-5 text-[11px] uppercase tracking-widest text-muted-foreground/50">Buy Data</h4>
            <ul className="space-y-3">
              <li><Link to="/buy-data" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors">All Bundle Sizes</Link></li>
              <li><Link to="/mtn-data-bundles-ghana" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors">MTN Bundles (90-day)</Link></li>
              <li><Link to="/telecel-data-bundles-ghana" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors">Telecel Bundles (non-expiry)</Link></li>
              <li><Link to="/airteltigo-data-bundles-ghana" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors">AirtelTigo Bundles (non-expiry)</Link></li>
              <li><Link to="/cheapest-data-bundles-ghana" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors">Cheapest Bundles</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-display font-semibold mb-5 text-[11px] uppercase tracking-widest text-muted-foreground/50">Support</h4>
            <ul className="space-y-3">
              <li>
                <a href="mailto:support@yiego.com" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors duration-150">
                  support@yiego.com
                </a>
              </li>
              <li>
                <Link to="/support" className="text-sm text-muted-foreground/70 hover:text-primary transition-colors duration-150">
                  Live Chat Support
                </Link>
              </li>
              <li className="text-xs text-muted-foreground/40 leading-relaxed">
                Most orders arrive within minutes. If a bundle hasn't arrived after 12 hours, contact support.
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-6 flex flex-col md:flex-row justify-between items-center gap-3">
          <p className="text-xs text-muted-foreground/50">© YieGo {new Date().getFullYear()} — Ghana's Cheapest Data Bundles. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/terms" className="text-xs text-muted-foreground/40 hover:text-primary transition-colors duration-150">Terms of Service</Link>
            <Link to="/privacy" className="text-xs text-muted-foreground/40 hover:text-primary transition-colors duration-150">Privacy Policy</Link>
            <Link to="/disclaimer" className="text-xs text-muted-foreground/40 hover:text-primary transition-colors duration-150">Disclaimer</Link>
          </div>
        </div>

        <div className="border-t border-border/30 mt-6 pt-5 text-center">
          <p className="text-[11px] text-muted-foreground/40 tracking-wide">
            Powered by{' '}
            <a
              href="https://jjsolutionsdigital.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/40 hover:text-primary transition-colors duration-200 hover:underline underline-offset-2"
            >
              JJ Solutions
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
