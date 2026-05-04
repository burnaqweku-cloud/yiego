import { Link } from 'react-router-dom';
import { Wifi, Zap, Shield, MapPin, ArrowRight } from 'lucide-react';

const NETWORK_PAGES = [
  { label: 'Buy MTN Data Bundles in Ghana', to: '/buy-mtn-data-bundles-ghana', icon: '🟡' },
  { label: 'Buy Telecel Data Bundles in Ghana', to: '/buy-telecel-data-bundles-ghana', icon: '🔴' },
  { label: 'Buy AirtelTigo Data Bundles in Ghana', to: '/buy-airteltigo-data-bundles-ghana', icon: '🔵' },
];

const FEATURES = [
  { icon: Zap, title: 'Fast Delivery', desc: 'Data bundles delivered within minutes across all networks in Ghana' },
  { icon: Shield, title: 'Secure Paystack Payment', desc: 'Pay safely with Mobile Money (MoMo) and bank cards' },
  { icon: Wifi, title: 'All Networks', desc: 'MTN Ghana, Telecel Ghana, and AirtelTigo data bundles' },
  { icon: MapPin, title: 'Ghana-Wide', desc: 'Serving customers in Accra, Kumasi, Tamale, and all of Ghana' },
];

const SEOContentSection = () => {
  return (
    <section className="bg-card border-y border-border">
      <div className="container py-12 md:py-16">
        {/* Main heading */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">
            Buy Affordable Data Bundles in Ghana
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            DataSika is Ghana's trusted platform for buying <strong>MTN data bundles</strong>,{' '}
            <strong>Telecel data bundles</strong>, and <strong>AirtelTigo data bundles</strong> online.
            Enjoy fast delivery, secure Paystack payments via Mobile Money, and affordable prices on all data packages.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {FEATURES.map(f => (
            <div key={f.title} className="flex gap-3 items-start">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <f.icon className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-0.5">{f.title}</h3>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Network links */}
        <div className="grid sm:grid-cols-3 gap-3 mb-8">
          {NETWORK_PAGES.map(page => (
            <Link
              key={page.to}
              to={page.to}
              className="group flex items-center gap-3 bg-background border border-border rounded-xl px-5 py-4 hover:border-primary/30 hover:shadow-sm transition-all"
            >
              <span className="text-xl">{page.icon}</span>
              <span className="text-sm font-semibold group-hover:text-primary transition-colors flex-1">
                {page.label}
              </span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          ))}
        </div>

        {/* Additional links */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center text-xs">
          <Link to="/cheap-data-bundles-ghana" className="text-primary hover:underline font-medium">Cheap Data Bundles Ghana</Link>
          <Link to="/buy-data-online-ghana" className="text-primary hover:underline font-medium">Buy Data Online Ghana</Link>
          <Link to="/mtn-data-prices-ghana" className="text-primary hover:underline font-medium">MTN Data Prices</Link>
          <Link to="/telecel-data-prices-ghana" className="text-primary hover:underline font-medium">Telecel Data Prices</Link>
          <Link to="/airteltigo-data-prices-ghana" className="text-primary hover:underline font-medium">AirtelTigo Data Prices</Link>
          <Link to="/blog" className="text-primary hover:underline font-medium">Blog & Guides</Link>
        </div>
      </div>
    </section>
  );
};

export default SEOContentSection;
