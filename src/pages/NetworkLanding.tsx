import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import FAQStructuredData from '@/components/seo/FAQStructuredData';
import BundleCard from '@/components/bundles/BundleCard';
import PurchaseModal from '@/components/bundles/PurchaseModal';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { usePricing } from '@/hooks/usePricing';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Shield, Zap, CheckCircle, Infinity } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getValidityLabel, isNonExpiry } from '@/components/bundles/ValidityBadge';

interface LandingConfig {
  network?: string;
  title: string;
  h1: string;
  description: string;
  seoDescription: string;
  intro: string;
  faqs: { question: string; answer: string }[];
  keywords: string;
}

const LANDING_CONFIGS: Record<string, LandingConfig> = {
  'buy-mtn-data-bundles-ghana': {
    network: 'MTN',
    title: 'Buy MTN Data Bundles in Ghana — Affordable Prices | DataSika',
    h1: 'Buy MTN Data Bundles in Ghana',
    description: 'Buy affordable MTN data bundles in Ghana. All MTN bundles valid for 90 days. Pay with Mobile Money or card.',
    seoDescription: 'Buy cheap MTN data bundles in Ghana online on DataSika. All MTN bundles valid for 90 days. Fast delivery, secure MoMo payment.',
    intro: 'Get the best prices on MTN Ghana data bundles. All MTN bundles on DataSika are valid for 90 days. Secure Paystack payments via Mobile Money (MoMo) and cards.',
    keywords: 'buy MTN data Ghana, MTN data bundles, MTN data prices Ghana, cheap MTN data, MTN 90 days',
    faqs: [
      { question: 'How fast is MTN data delivery?', answer: 'Usually within a few minutes. May occasionally take longer — up to a few hours in rare cases. Contact support if a bundle hasn\'t arrived after 12 hours.' },
      { question: 'How long are MTN bundles valid?', answer: 'All MTN bundles purchased on DataSika are valid for 90 days from purchase.' },
      { question: 'How to buy MTN data online in Ghana?', answer: 'Visit datasika.com, select MTN, choose your bundle size, enter the recipient\'s MTN number, and pay with Mobile Money or card.' },
      { question: 'Can I buy MTN data for someone else?', answer: 'Yes — just enter the recipient\'s MTN number at checkout.' },
      { question: 'What if my bundle doesn\'t arrive?', answer: 'Failed orders are automatically refunded. If you\'ve waited 12+ hours and nothing arrived, contact support@datasika.com or live chat.' },
    ],
  },
  'buy-telecel-data-bundles-ghana': {
    network: 'Telecel',
    title: 'Buy Telecel Data Bundles in Ghana — Best Prices | DataSika',
    h1: 'Buy Telecel Data Bundles in Ghana',
    description: 'Buy affordable Telecel (formerly Vodafone) data bundles in Ghana. Non-expiry bundles, secure MoMo payment.',
    seoDescription: 'Buy cheap Telecel data bundles in Ghana on DataSika. Non-expiry bundles. Fast delivery, secure payments.',
    intro: 'Looking for affordable Telecel data bundles in Ghana? Telecel bundles on DataSika are non-expiry — your data stays on the line until you use it. Pay with MoMo, card, or DataSika wallet.',
    keywords: 'buy Telecel data Ghana, Telecel data bundles, Vodafone Ghana data, Telecel non-expiry data',
    faqs: [
      { question: 'How long do Telecel bundles last?', answer: 'Telecel bundles on DataSika are non-expiry — your data stays on the line until you use it.' },
      { question: 'Is Telecel the same as Vodafone Ghana?', answer: 'Yes, Telecel is the rebranded name of Vodafone Ghana.' },
      { question: 'How fast is Telecel data delivery?', answer: 'Usually within a few minutes. In rare cases may take a few hours. Contact support if a bundle hasn\'t arrived after 12 hours.' },
      { question: 'Can I check my Telecel data balance after buying?', answer: 'Yes, dial *700# on your Telecel phone to check your data balance.' },
    ],
  },
  'buy-airteltigo-data-bundles-ghana': {
    network: 'AirtelTigo',
    title: 'Buy AirtelTigo Data Bundles in Ghana — Cheapest Prices | DataSika',
    h1: 'Buy AirtelTigo Data Bundles in Ghana',
    description: 'Buy the cheapest AirtelTigo data bundles in Ghana. Non-expiry bundles. Secure Mobile Money payment.',
    seoDescription: 'Buy affordable AirtelTigo data bundles in Ghana online. Non-expiry bundles, fast delivery on DataSika.',
    intro: 'AirtelTigo offers some of the most affordable data in Ghana. All AirtelTigo bundles on DataSika are non-expiry — your data stays on the line until you use it.',
    keywords: 'buy AirtelTigo data Ghana, AirtelTigo data bundles, AT data Ghana, AirtelTigo non-expiry data',
    faqs: [
      { question: 'How long do AirtelTigo bundles last?', answer: 'AirtelTigo bundles on DataSika are non-expiry — your data stays on the line until you use it.' },
      { question: 'Is AirtelTigo data cheaper than MTN?', answer: 'Generally yes — AirtelTigo offers some of the lowest per-GB prices in Ghana.' },
      { question: 'How fast is AirtelTigo data delivery?', answer: 'Usually within a few minutes. In rare cases may take a few hours. Contact support if it hasn\'t arrived after 12 hours.' },
      { question: 'How do I check AirtelTigo data balance?', answer: 'Dial *141# on your AirtelTigo phone.' },
    ],
  },
  'cheap-data-bundles-ghana': {
    title: 'Cheap Data Bundles in Ghana — Compare MTN, Telecel & AirtelTigo | DataSika',
    h1: 'Cheap Data Bundles in Ghana',
    description: 'Compare and buy the cheapest data bundles from MTN, Telecel & AirtelTigo in Ghana on DataSika.',
    seoDescription: 'Find the cheapest data bundles in Ghana. Compare MTN, Telecel & AirtelTigo prices on DataSika.',
    intro: 'Looking for cheap data bundles in Ghana? Datasika prices are genuinely much cheaper than buying directly from MTN, Telecel, or AirtelTigo. Compare and pick the size you need.',
    keywords: 'cheap data bundles Ghana, affordable data Ghana, compare data prices Ghana',
    faqs: [
      { question: 'Which network has the cheapest data in Ghana?', answer: 'AirtelTigo generally offers the lowest per-GB prices, followed by Telecel and MTN. Prices vary by bundle size — see the live catalog.' },
      { question: 'Where can I buy cheap data bundles in Ghana?', answer: 'DataSika offers competitive prices on all networks at much lower rates than buying direct.' },
      { question: 'How can I save money on data in Ghana?', answer: 'Pick the right bundle size for your usage. Telecel and AirtelTigo bundles do not expire, so larger purchases stay safe on your line.' },
    ],
  },
  'buy-data-online-ghana': {
    title: 'Buy Data Online in Ghana — All Networks | DataSika',
    h1: 'Buy Data Online in Ghana',
    description: 'Buy data bundles online for MTN, Telecel & AirtelTigo in Ghana. No account needed. Mobile Money accepted.',
    seoDescription: 'Buy data online in Ghana for MTN, Telecel & AirtelTigo. No signup required. Secure MoMo payment on DataSika.',
    intro: 'Buy data bundles online in Ghana without leaving your home. DataSika supports all major networks — MTN, Telecel, and AirtelTigo — with secure Mobile Money and card payments. No account required.',
    keywords: 'buy data online Ghana, online data Ghana, data top up Ghana',
    faqs: [
      { question: 'Can I buy data online in Ghana without an account?', answer: 'Yes — DataSika lets you buy data as a guest. Creating an account is optional but unlocks wallet, history, and easier tracking.' },
      { question: 'What payment methods can I use to buy data online?', answer: 'MTN MoMo, Telecel Cash, AirtelTigo Money, Visa, Mastercard, and DataSika wallet — all via Paystack.' },
      { question: 'Is it safe to buy data online in Ghana?', answer: 'Yes — DataSika uses Paystack, Ghana\'s most trusted payment gateway, for all transactions.' },
    ],
  },
  'mtn-data-prices-ghana': {
    network: 'MTN',
    title: 'MTN Data Prices in Ghana 2026 — Live Bundle Prices | DataSika',
    h1: 'MTN Data Prices in Ghana (2026)',
    description: 'Check the latest live MTN data bundle prices in Ghana for 2026. All MTN bundles valid for 90 days.',
    seoDescription: 'Updated live MTN data prices in Ghana for 2026. All bundles valid for 90 days. Buy on DataSika.',
    intro: 'Check the latest live MTN Ghana data bundle prices. All MTN bundles on DataSika are valid for 90 days. See the catalog below for current prices.',
    keywords: 'MTN data prices Ghana 2026, MTN data bundle prices, MTN data rates Ghana',
    faqs: [
      { question: 'How long are MTN bundles valid?', answer: 'All MTN bundles on DataSika are valid for 90 days from purchase.' },
      { question: 'Are MTN data prices going up in 2026?', answer: 'Prices may vary. DataSika always shows current live prices.' },
      { question: 'Where can I find the cheapest MTN data?', answer: 'DataSika offers MTN data at much cheaper prices than buying direct from MTN.' },
    ],
  },
  'telecel-data-prices-ghana': {
    network: 'Telecel',
    title: 'Telecel Data Prices in Ghana 2026 — Live Prices | DataSika',
    h1: 'Telecel Data Prices in Ghana (2026)',
    description: 'Check live Telecel data bundle prices in Ghana for 2026. Non-expiry bundles on DataSika.',
    seoDescription: 'Live Telecel (formerly Vodafone) data prices in Ghana 2026. Non-expiry bundles on DataSika.',
    intro: 'View the latest live Telecel (formerly Vodafone Ghana) data bundle prices. Telecel bundles on DataSika are non-expiry.',
    keywords: 'Telecel data prices Ghana 2026, Vodafone data prices Ghana, Telecel bundle rates',
    faqs: [
      { question: 'How long do Telecel bundles last?', answer: 'Telecel bundles on DataSika are non-expiry — your data stays on the line until you use it.' },
      { question: 'Are Telecel and Vodafone the same?', answer: 'Yes — Vodafone Ghana has been rebranded to Telecel Ghana. Same network, new name.' },
    ],
  },
  'airteltigo-data-prices-ghana': {
    network: 'AirtelTigo',
    title: 'AirtelTigo Data Prices in Ghana 2026 — Live Prices | DataSika',
    h1: 'AirtelTigo Data Prices in Ghana (2026)',
    description: 'Live AirtelTigo data bundle prices in Ghana 2026. Non-expiry bundles on DataSika.',
    seoDescription: 'Live AirtelTigo data prices in Ghana 2026. Non-expiry bundles on DataSika.',
    intro: 'AirtelTigo offers some of the most affordable data bundles in Ghana. AirtelTigo bundles on DataSika are non-expiry.',
    keywords: 'AirtelTigo data prices Ghana 2026, AT data prices, AirtelTigo bundle rates Ghana',
    faqs: [
      { question: 'How long do AirtelTigo bundles last?', answer: 'AirtelTigo bundles on DataSika are non-expiry.' },
      { question: 'Why is AirtelTigo data so cheap?', answer: 'AirtelTigo positions itself as the most affordable network in Ghana.' },
    ],
  },

  // ─── SEO-canonical network slugs ───
  'mtn-data-bundles-ghana': {
    network: 'MTN',
    title: 'Cheap MTN Data Bundles Ghana | Buy MTN Data Online — DataSika',
    h1: 'Buy Cheap MTN Data Bundles in Ghana',
    description: 'Cheap MTN data bundles in Ghana. All sizes, valid for 90 days. Lowest prices on DataSika.',
    seoDescription: 'Buy cheap MTN data bundles in Ghana on DataSika. All MTN bundles valid for 90 days. Fast delivery via mobile money.',
    intro: 'All MTN bundles on Datasika are valid for 90 days from purchase. DataSika is Ghana\'s go-to platform for cheap MTN data — sold by size (1GB, 2GB, 5GB, 10GB and more) at prices much lower than buying direct.',
    keywords: 'cheap MTN data bundles Ghana, buy MTN data online Ghana, MTN 90 days, MTN data top up Ghana',
    faqs: [
      { question: 'How cheap are MTN data bundles on DataSika?', answer: 'DataSika prices are genuinely much cheaper than buying directly from MTN. Same bundle, same network, far lower price.' },
      { question: 'How fast is MTN data delivery?', answer: 'Usually within a few minutes. May occasionally take longer — up to a few hours in rare cases. Contact support if a bundle hasn\'t arrived after 12 hours.' },
      { question: 'How long are MTN bundles valid?', answer: 'All MTN bundles on DataSika are valid for 90 days from purchase.' },
      { question: 'Can I buy MTN data for someone else?', answer: 'Yes — just enter the recipient\'s MTN number at checkout.' },
      { question: 'What if my bundle doesn\'t arrive?', answer: 'Failed orders are automatically refunded. If you\'ve waited 12+ hours and nothing arrived, contact support@datasika.com or live chat.' },
    ],
  },
  'telecel-data-bundles-ghana': {
    network: 'Telecel',
    title: 'Cheap Telecel (Vodafone) Data Bundles Ghana | Buy Online — DataSika',
    h1: 'Buy Cheap Telecel Data Bundles in Ghana',
    description: 'Cheap Telecel (formerly Vodafone) data bundles in Ghana. Non-expiry bundles. Lowest prices on DataSika.',
    seoDescription: 'Buy cheap Telecel data bundles in Ghana on DataSika. Non-expiry bundles. Fast delivery via Mobile Money.',
    intro: 'Telecel bundles on Datasika are non-expiry — your data stays on the line until you use it. DataSika delivers Telecel bundles at the lowest prices online with secure Mobile Money or card payments.',
    keywords: 'cheap Telecel data bundles Ghana, Telecel non-expiry, Vodafone data bundle Ghana, Telecel data prices',
    faqs: [
      { question: 'How long do Telecel bundles last?', answer: 'Telecel bundles on DataSika are non-expiry — your data stays on the line until you use it.' },
      { question: 'Is Telecel the same as Vodafone Ghana?', answer: 'Yes — Vodafone Ghana has been rebranded as Telecel Ghana.' },
      { question: 'How cheap is Telecel data on DataSika?', answer: 'DataSika prices are much cheaper than buying directly from Telecel.' },
      { question: 'How fast does Telecel data deliver?', answer: 'Usually within a few minutes. In rare cases may take a few hours. Contact support if it hasn\'t arrived after 12 hours.' },
      { question: 'Do you accept Telecel Cash?', answer: 'Yes — pay with Telecel Cash, MTN MoMo, AirtelTigo Money, or Visa/Mastercard via Paystack.' },
    ],
  },
  'airteltigo-data-bundles-ghana': {
    network: 'AirtelTigo',
    title: 'Cheap AirtelTigo Data Bundles Ghana | Buy AT Data Online — DataSika',
    h1: 'Buy Cheap AirtelTigo Data Bundles in Ghana',
    description: 'Cheap AirtelTigo (AT) data bundles in Ghana. All sizes, non-expiry. Lowest prices on DataSika.',
    seoDescription: 'Buy cheap AirtelTigo (AT) data bundles in Ghana on DataSika. Non-expiry bundles. Pay with AirtelTigo Money or any mobile money.',
    intro: 'AirtelTigo bundles on Datasika are non-expiry — your data stays on the line until you use it. DataSika prices are much cheaper than buying directly from AirtelTigo.',
    keywords: 'cheap AirtelTigo data bundles Ghana, AT non-expiry, AirtelTigo data prices, AT data top up Ghana',
    faqs: [
      { question: 'How long do AirtelTigo bundles last?', answer: 'AirtelTigo bundles on DataSika are non-expiry — your data stays on the line until you use it.' },
      { question: 'Is AirtelTigo data the cheapest in Ghana?', answer: 'AirtelTigo typically has some of the lowest per-GB data prices in Ghana, and DataSika passes those savings on.' },
      { question: 'How do I check my AirtelTigo balance?', answer: 'Dial *141# on your AirtelTigo line.' },
      { question: 'Can I use any payment method?', answer: 'Yes — AirtelTigo Money, MTN MoMo, Telecel Cash, and Visa/Mastercard via Paystack.' },
      { question: 'Do you deliver outside Accra?', answer: 'Yes — anywhere in Ghana with a working AirtelTigo line.' },
    ],
  },
  'cheapest-data-bundles-ghana': {
    title: 'Cheapest Data Bundles in Ghana 2026 — Compare All Networks | DataSika',
    h1: 'Cheapest Data Bundles in Ghana (2026)',
    description: 'The cheapest data bundles in Ghana for MTN, Telecel & AirtelTigo on DataSika.',
    seoDescription: 'The cheapest data bundles in Ghana for MTN, Telecel & AirtelTigo. Compare and buy on DataSika.',
    intro: 'Looking for the cheapest data bundles in Ghana? DataSika lists every active MTN (90-day), Telecel (non-expiry) and AirtelTigo (non-expiry) bundle at our lowest live prices.',
    keywords: 'cheapest data bundles Ghana, cheapest data Ghana 2026, lowest data prices Ghana',
    faqs: [
      { question: 'Which network has the cheapest data in Ghana?', answer: 'It depends on the bundle size. AirtelTigo often wins on per-GB price. Compare them all live on DataSika.' },
      { question: 'How is DataSika cheaper than buying direct?', answer: 'DataSika sources bundles in bulk and passes the savings on. Same bundle, far lower price.' },
      { question: 'Are the prices on DataSika real-time?', answer: 'Yes — prices reflect current selling prices and update whenever supplier costs change.' },
      { question: 'Is there a minimum order?', answer: 'No minimum. Buy a single 1GB bundle or stock up — your choice.' },
    ],
  },

  // ─── Location pages ───
  'buy-data-bundles-accra': {
    title: 'Buy Cheap Data Bundles in Accra — All Networks | DataSika',
    h1: 'Buy Cheap Data Bundles in Accra',
    description: 'Buy cheap MTN, Telecel & AirtelTigo data bundles in Accra. Usually delivered within a few minutes.',
    seoDescription: 'Buy cheap data bundles in Accra on DataSika. MTN, Telecel & AirtelTigo bundles delivered to any Greater Accra number.',
    intro: 'In Accra, DataSika is the easiest way to top up data. Buy MTN, Telecel or AirtelTigo bundles online and have them delivered to any number in Greater Accra — usually within a few minutes.',
    keywords: 'buy data Accra, cheap data Accra, MTN data Accra, data bundle Accra Ghana',
    faqs: [
      { question: 'Does DataSika work in all of Accra?', answer: 'Yes — DataSika delivers to any active MTN, Telecel or AirtelTigo line in Greater Accra and across Ghana.' },
    ],
  },
  'buy-data-bundles-kumasi': {
    title: 'Buy Cheap Data Bundles in Kumasi — All Networks | DataSika',
    h1: 'Buy Cheap Data Bundles in Kumasi',
    description: 'Buy cheap MTN, Telecel & AirtelTigo data bundles in Kumasi. Usually delivered within a few minutes.',
    seoDescription: 'Buy cheap data bundles in Kumasi on DataSika. MTN, Telecel & AirtelTigo bundles delivered across the Ashanti Region.',
    intro: 'Kumasi customers love DataSika for fast, cheap data. Top up MTN, Telecel or AirtelTigo bundles online from anywhere in the Ashanti Region.',
    keywords: 'buy data Kumasi, cheap data Kumasi, MTN data Kumasi, data bundle Ashanti',
    faqs: [
      { question: 'How fast is delivery in Kumasi?', answer: 'Same as everywhere in Ghana — usually within a few minutes of payment confirmation.' },
    ],
  },
  'buy-data-bundles-tamale': {
    title: 'Buy Cheap Data Bundles in Tamale — All Networks | DataSika',
    h1: 'Buy Cheap Data Bundles in Tamale',
    description: 'Buy cheap MTN, Telecel & AirtelTigo data bundles in Tamale. Delivered to any line in the Northern Region.',
    seoDescription: 'Buy cheap data bundles in Tamale on DataSika. Delivered across the Northern Region.',
    intro: 'DataSika reaches every corner of Ghana — including Tamale. Buy cheap MTN, Telecel or AirtelTigo data online and have it delivered to your line, usually within a few minutes.',
    keywords: 'buy data Tamale, cheap data Tamale, data bundle Northern Region Ghana',
    faqs: [
      { question: 'Does DataSika serve the Northern Region?', answer: 'Yes — anywhere in Ghana with a working MTN, Telecel or AirtelTigo line.' },
    ],
  },
  'buy-data-bundles-takoradi': {
    title: 'Buy Cheap Data Bundles in Takoradi — All Networks | DataSika',
    h1: 'Buy Cheap Data Bundles in Takoradi',
    description: 'Buy cheap MTN, Telecel & AirtelTigo data bundles in Takoradi. Delivered across the Western Region.',
    seoDescription: 'Buy cheap data bundles in Takoradi on DataSika. Delivered across the Western Region.',
    intro: 'Takoradi residents can buy cheap data online with DataSika. MTN, Telecel and AirtelTigo bundles delivered to your line, usually within a few minutes.',
    keywords: 'buy data Takoradi, cheap data Takoradi, data bundle Western Region Ghana',
    faqs: [
      { question: 'Can I pay with mobile money in Takoradi?', answer: 'Yes — MTN MoMo, Telecel Cash, AirtelTigo Money and bank cards are all accepted.' },
    ],
  },
  'buy-data-bundles-cape-coast': {
    title: 'Buy Cheap Data Bundles in Cape Coast — All Networks | DataSika',
    h1: 'Buy Cheap Data Bundles in Cape Coast',
    description: 'Buy cheap MTN, Telecel & AirtelTigo data bundles in Cape Coast. Delivered across the Central Region.',
    seoDescription: 'Buy cheap data bundles in Cape Coast on DataSika. Delivered across the Central Region.',
    intro: 'Whether you\'re a student at UCC or a business owner in Cape Coast, DataSika is the easiest way to buy cheap data online. Usually delivered within a few minutes.',
    keywords: 'buy data Cape Coast, cheap data Cape Coast, data bundle Central Region Ghana',
    faqs: [
      { question: 'Is DataSika good for students?', answer: 'Yes — pick the bundle size that fits your usage. Telecel and AirtelTigo bundles never expire.' },
    ],
  },
};

const NetworkLanding = () => {
  const { pathname } = useLocation();
  // Derive the slug from the pathname (e.g. "/mtn-data-bundles-ghana" -> "mtn-data-bundles-ghana").
  // This matches both the legacy "buy-*" routes and the new SEO-canonical routes.
  const page = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const config = LANDING_CONFIGS[page];
  const { bundles, loadingBundles } = useAdmin();
  const { getSellingPrice, loadingPricing } = usePricing();
  const [selectedBundle, setSelectedBundle] = useState<DbBundle | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filteredBundles = useMemo(() => {
    let filtered = bundles.filter(b => b.active);
    if (config?.network) {
      filtered = filtered.filter(b => b.network === config.network);
    }
    return filtered;
  }, [bundles, config]);

  if (!config) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="text-2xl font-display font-bold mb-4">Page Not Found</h1>
          <Link to="/"><Button>Go Home</Button></Link>
        </div>
      </Layout>
    );
  }

  const isLoading = loadingBundles || loadingPricing;

  const handleBuy = (bundle: DbBundle) => {
    setSelectedBundle(bundle);
    setModalOpen(true);
  };

  return (
    <Layout>
      <SEOHead
        title={config.title}
        description={config.seoDescription}
        path={`/${page}`}
      />
      <FAQStructuredData faqs={config.faqs} />

      <div className="container py-8 md:py-12">
        <Breadcrumbs items={[
          { label: 'Buy Data', href: '/buy-data' },
          { label: config.h1 },
        ]} />

        {/* Hero section */}
        <div className="surface-premium rounded-3xl p-6 md:p-10 mb-10 max-w-4xl shadow-[0_20px_60px_-30px_hsl(var(--primary)/0.25)]">
          {config.network && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary mb-3 px-2.5 py-1 rounded-full bg-primary/10 ring-1 ring-primary/20">
              {config.network} · Ghana
            </span>
          )}
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4 tracking-tight">{config.h1}</h1>
          <p className="text-muted-foreground leading-relaxed mb-6 text-sm md:text-base max-w-2xl">{config.intro}</p>

          <div className="flex flex-wrap gap-2 mb-6">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
              <Zap className="w-3.5 h-3.5" />
              <span>Fast Delivery</span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
              <Shield className="w-3.5 h-3.5" />
              <span>Secure Payment</span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-success/10 text-success ring-1 ring-success/20">
              {isNonExpiry(config.network) ? <Infinity className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
              <span>{getValidityLabel(config.network)}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-muted/40 text-muted-foreground ring-1 ring-border/60">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>No Account Needed</span>
            </div>
          </div>

          <Link to="/buy-data">
            <Button variant="premium" className="gap-2 h-11 px-6 font-bold">
              View All Bundles <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* Bundle grid */}
        <h2 className="text-2xl font-display font-bold mb-6">
          {config.network ? `${config.network} Data Bundles` : 'All Data Bundles'}
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[180px] w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-12">
            {filteredBundles.map(bundle => (
              <BundleCard key={bundle.id} bundle={bundle} onBuy={handleBuy} sellingPrice={getSellingPrice(bundle)} />
            ))}
          </div>
        )}

        {/* FAQ Section */}
        <section className="max-w-2xl mx-auto mt-12">
          <h2 className="text-2xl font-display font-bold mb-6 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="space-y-3">
            {config.faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="surface-premium rounded-2xl px-6 data-[state=open]:ring-1 data-[state=open]:ring-primary/30 transition-all"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5 text-sm md:text-base">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed text-sm">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Internal links */}
        <section className="mt-12 pt-8 border-t border-border">
          <h2 className="text-xl font-display font-bold mb-4">Related Pages</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(LANDING_CONFIGS)
              .filter(([key]) => key !== page)
              .slice(0, 6)
              .map(([key, val]) => (
                <Link
                  key={key}
                  to={`/${key}`}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  {val.h1} →
                </Link>
              ))}
            <Link to="/blog" className="text-sm text-primary hover:underline font-medium">
              DataSika Blog →
            </Link>
            <Link to="/faq" className="text-sm text-primary hover:underline font-medium">
              FAQ — Frequently Asked Questions →
            </Link>
          </div>
        </section>
      </div>

      <PurchaseModal
        bundle={selectedBundle}
        open={modalOpen}
        onOpenChange={setModalOpen}
        getSellingPrice={getSellingPrice}
      />
    </Layout>
  );
};

export default NetworkLanding;
