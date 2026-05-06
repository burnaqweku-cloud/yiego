import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

// Broader, platform-wide questions — not data-only.
const HOMEPAGE_FAQS = [
  {
    q: 'What can I do on YieGo?',
    a: 'YieGo is your everyday digital wallet for Ghana — buy data bundles today, with airtime, bills and subscriptions rolling out next.',
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
    <section className="py-20 md:py-28 relative overflow-hidden" ref={ref}>
      {/* Ambient indigo wash */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-[-10%] w-[400px] h-[400px] rounded-full bg-primary/[0.05] blur-3xl" />
      </div>
      <div className="container relative">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* Left: heading + support callout */}
          <div className="lg:col-span-4 reveal-on-scroll lg:sticky lg:top-24">
            <div className="inline-flex items-center gap-2 mb-4">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">FAQ</span>
            </div>
            <h2 className="text-3xl md:text-[2.6rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
              Quick answers <br />
              for <span className="text-gradient">everyday users.</span>
            </h2>
            <p className="text-sm text-muted-foreground mt-5 max-w-sm leading-relaxed">
              The essentials, in plain language. Need something specific? Our team is one tap away.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              <Link to="/faq">
                <Button variant="outline" className="rounded-full gap-2 h-10 backdrop-blur-sm bg-card/40 hover:bg-card/80 hover:border-primary/40">
                  All FAQs <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <Link to="/support">
                <Button variant="ghost" className="rounded-full gap-2 h-10 hover:bg-primary/5 hover:text-primary">
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
                  className="group border border-border bg-card/70 backdrop-blur-sm rounded-2xl px-5 data-[state=open]:border-primary/40 data-[state=open]:bg-card data-[state=open]:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.35)] hover:border-primary/25 transition-all duration-300"
                >
                  <AccordionTrigger className="text-left font-semibold hover:no-underline py-4 text-[14px] gap-3">
                    <span className="flex items-center gap-3">
                      <span className="w-1 h-1 rounded-full bg-primary opacity-0 group-data-[state=open]:opacity-100 transition-opacity" />
                      {faq.q}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4 text-[13.5px] leading-relaxed pl-4 border-l border-primary/20 ml-1">
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
