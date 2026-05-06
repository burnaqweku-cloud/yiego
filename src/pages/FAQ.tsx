import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HelpCircle, Wallet, Smartphone, Shield, Sparkles, MessageCircle, ArrowRight } from 'lucide-react';
import SEOHead from '@/components/seo/SEOHead';
import FAQStructuredData from '@/components/seo/FAQStructuredData';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

type FaqItem = { question: string; answer: string };
type FaqGroup = { id: string; title: string; icon: typeof HelpCircle; items: FaqItem[] };

const FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'about',
    title: 'About YieGo',
    icon: Shield,
    items: [
      {
        question: 'What is YieGo?',
        answer:
          "YieGo is Ghana's everyday digital wallet. Buy data bundles today, with airtime, bill payments and subscription top-ups rolling out next — all from a single account, no separate logins.",
      },
      {
        question: 'Is YieGo safe to use?',
        answer:
          'Yes. Every payment runs through a trusted payment provider used by major Ghanaian businesses, the site is fully SSL-encrypted, and tens of thousands of Ghanaians use YieGo every month.',
      },
      {
        question: 'Why is YieGo cheaper than buying data direct?',
        answer:
          'We work with bulk distribution partners and pass the savings on. Same MTN, Telecel or AirtelTigo bundle — just much less money out of your pocket.',
      },
    ],
  },
  {
    id: 'data',
    title: 'Buying Data',
    icon: Smartphone,
    items: [
      {
        question: 'How fast is data delivered after I pay?',
        answer:
          "Data bundles are delivered very fast under normal conditions — most arrive within minutes of payment. Occasionally delivery can take a little longer due to network delays, supplier validation, heavy traffic or other technical hiccups. If your bundle hasn't arrived in a reasonable time, just reach out to support with your Order ID and our team will sort it out.",
      },
      {
        question: 'How long do my bundles last?',
        answer:
          'MTN bundles are valid for 90 days. AirtelTigo bundles are valid for 60 days. Telecel bundles never expire — the data stays on your line until you use it.',
      },
      {
        question: "Can I buy data for someone else's number?",
        answer:
          "Yes. Just enter the recipient's number at checkout — works on any of the three networks. Tip: double-check the number, since wrong-number deliveries can't be refunded.",
      },
      {
        question: 'Do I need an account to buy data?',
        answer:
          'No — guest checkout works fine. Creating a free account adds a wallet (no fees on repeat orders), order history, faster repeat purchases, and easier tracking.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & Wallet',
    icon: Wallet,
    items: [
      {
        question: 'Which payment methods do you accept?',
        answer:
          'MTN MoMo, Telecel Cash, AirtelTigo Money, Visa and Mastercard — all processed securely through our trusted payment provider. Once you fund your YieGo wallet, you can also pay from there with one tap.',
      },
      {
        question: "What happens if my order fails or doesn't arrive?",
        answer:
          "Failed orders are automatically refunded to your wallet (or your original payment method) within minutes. You're always made whole — no exceptions.",
      },
    ],
  },
  {
    id: 'platform',
    title: 'Platform & Support',
    icon: Sparkles,
    items: [
      {
        question: 'What other services are coming to YieGo?',
        answer:
          'Airtime top-ups, bill payments (ECG, water, TV), subscription services (Netflix, Spotify and more), and digital products like vouchers. All through the same wallet — no separate signups.',
      },
      {
        question: 'How do I become a YieGo agent?',
        answer:
          'Apply for free on the Become an Agent page. Once approved, activate your store subscription, set your own prices, and earn on every order placed through your store link.',
      },
      {
        question: 'How do I track an order or contact support?',
        answer:
          'Use your Order ID on the Track Order page — no login needed. For everything else, email support@yiego.com or use live chat (9am–9pm). AI-assisted help runs 24/7.',
      },
    ],
  },
];

const ALL_FAQS = FAQ_GROUPS.flatMap((g) => g.items);

const FAQ = () => {
  return (
    <Layout>
      <SEOHead
        title="FAQ — Frequently Asked Questions | YieGo"
        description="Answers to the most common questions about YieGo — buying data bundles in Ghana, payments, the wallet, agent program and more."
        path="/faq"
      />
      <FAQStructuredData faqs={ALL_FAQS} />

      {/* ── Hero ── */}
      <section className="relative border-b border-border/40 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-card/60" />
          <div className="absolute -top-24 -right-12 w-[520px] h-[520px] rounded-full bg-primary/20 blur-3xl glow-drift" />
          <div className="absolute -bottom-32 -left-12 w-[400px] h-[400px] rounded-full bg-accent/10 blur-3xl glow-drift-slow" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
          />
          <div className="noise-overlay" />
        </div>

        <div className="container py-14 md:py-20 max-w-3xl">
          <Breadcrumbs items={[{ label: 'FAQ' }]} />

          <div className="text-center">
            <div className="relative inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 items-center justify-center mb-5 shadow-[0_12px_28px_-10px_hsl(var(--primary)/0.45),inset_0_1px_0_0_hsl(var(--primary)/0.3)]">
              <HelpCircle className="w-7 h-7 text-primary" strokeWidth={1.9} />
            </div>
            <div className="inline-flex items-center gap-2 mb-4">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Knowledge base</span>
              <span className="h-px w-8 bg-gradient-to-l from-transparent to-primary" />
            </div>
            <h1 className="text-3xl md:text-[2.6rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
              Frequently asked <br className="hidden sm:inline" />
              <span className="text-gradient">questions.</span>
            </h1>
            <p className="text-muted-foreground text-[14px] md:text-[14.5px] mt-4 max-w-md mx-auto leading-relaxed">
              Quick answers about YieGo — buying data, payments, your wallet, and what's coming next.
            </p>
          </div>
        </div>
      </section>

      {/* ── Grouped FAQs ── */}
      <div className="container py-12 max-w-3xl space-y-10">
        {FAQ_GROUPS.map((group) => (
          <section key={group.id}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
                <group.icon className="w-4 h-4 text-primary" strokeWidth={2} />
              </div>
              <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground/85">
                {group.title}
              </h2>
              <span className="ml-auto text-[10px] tabular text-muted-foreground/70 font-semibold">
                {group.items.length}
              </span>
            </div>

            <Accordion type="single" collapsible className="space-y-2.5">
              {group.items.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`${group.id}-${i}`}
                  className="group relative border border-border bg-card/70 backdrop-blur-sm rounded-2xl px-5 overflow-hidden data-[state=open]:border-primary/40 data-[state=open]:bg-card data-[state=open]:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.35)] hover:border-primary/25 transition-all duration-300"
                >
                  <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-data-[state=open]:opacity-100 transition-opacity" />
                  <AccordionTrigger className="text-left font-semibold hover:no-underline py-4 text-[14px] gap-3">
                    <span className="flex items-center gap-3">
                      <span className="w-1 h-1 rounded-full bg-primary opacity-0 group-data-[state=open]:opacity-100 transition-opacity" />
                      {faq.question}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4 text-[13.5px] leading-relaxed pl-4 border-l border-primary/20 ml-1">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}

        {/* ── Still need help callout ── */}
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/[0.06] via-card to-card p-7 md:p-9 text-center shadow-[0_24px_60px_-24px_hsl(var(--primary)/0.3)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="noise-overlay" />

          <div className="relative">
            <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 items-center justify-center mb-4 shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.4)]">
              <MessageCircle className="w-5 h-5 text-primary" strokeWidth={1.9} />
            </div>
            <h3 className="font-display font-extrabold text-xl md:text-[1.6rem] tracking-[-0.02em]">
              Still need help?
            </h3>
            <p className="text-[13.5px] text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
              Our support team is one message away. Live chat 9am–9pm, AI-assisted help round the clock.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              <Link
                to="/support"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-[0_10px_28px_-10px_hsl(var(--primary)/0.6)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-10px_hsl(var(--primary)/0.7)] transition-all"
              >
                Talk to support <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <a
                href="mailto:support@yiego.com"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-border bg-background/60 backdrop-blur-sm text-sm font-medium hover:border-primary/35 hover:bg-card transition-all"
              >
                Email us
              </a>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default FAQ;
