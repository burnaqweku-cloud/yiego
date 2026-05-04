import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

// Broader, platform-wide questions — not data-only.
const HOMEPAGE_FAQS = [
  {
    q: 'What can I do on YieGo?',
    a: 'YieGo is your everyday digital wallet for Ghana — buy data bundles today, with airtime, bills, subscriptions and social boosting rolling out next.',
  },
  {
    q: 'How long do data bundle orders take?',
    a: 'Most data orders are delivered within a few minutes under normal conditions. During network validation or heavy traffic, delivery may take longer. You can always track your order status.',
  },
  {
    q: 'Can I track my orders?',
    a: 'Yes — every order has a unique YieGo reference. Use the Track page or your dashboard to see live status, history and delivery details.',
  },
  {
    q: 'How do payments and wallet funding work?',
    a: 'Top up securely via Paystack with MTN MoMo, Telecel Cash, AirtelTigo Money, Visa or Mastercard. Funds reflect immediately and you can pay from your wallet at checkout.',
  },
  {
    q: 'What should I do if an order delays?',
    a: 'Your order is safely recorded and queued. If it has not delivered after a reasonable wait, contact support with your reference and our team will look into it.',
  },
];

const FAQPreview = () => {
  const ref = useScrollReveal();

  return (
    <section className="py-16 md:py-24" ref={ref}>
      <div className="container">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* Left: heading + support callout */}
          <div className="lg:col-span-4 reveal-on-scroll">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight mt-3 leading-tight">
              Quick answers <br /> for everyday users.
            </h2>
            <p className="text-sm text-muted-foreground mt-4 max-w-sm leading-relaxed">
              The essentials, in plain language. Need something specific? Our team is one tap away.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/faq">
                <Button variant="outline" className="rounded-full gap-2 h-10">
                  All FAQs <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <Link to="/support">
                <Button variant="ghost" className="rounded-full gap-2 h-10">
                  <MessageCircle className="w-3.5 h-3.5" /> Talk to support
                </Button>
              </Link>
            </div>
          </div>

          {/* Right: accordion */}
          <div className="lg:col-span-8 reveal-on-scroll">
            <Accordion type="single" collapsible className="space-y-2.5">
              {HOMEPAGE_FAQS.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border border-border bg-card rounded-2xl px-5 data-[state=open]:border-primary/40 data-[state=open]:shadow-[0_10px_30px_-15px_hsl(var(--primary)/0.3)] transition-all"
                >
                  <AccordionTrigger className="text-left font-semibold hover:no-underline py-4 text-[14px]">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4 text-[13.5px] leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQPreview;
