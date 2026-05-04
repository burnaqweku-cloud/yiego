import Layout from '@/components/layout/Layout';
import { FAQ_DATA } from '@/data/bundles';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HelpCircle } from 'lucide-react';
import SEOHead from '@/components/seo/SEOHead';
import FAQStructuredData from '@/components/seo/FAQStructuredData';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

const EXTRA_FAQS = [
  { question: 'Is YieGo legit?', answer: 'Yes — YieGo has served 50,000+ Ghanaians since launching in 2025. Payments are processed via Paystack, the site is SSL-encrypted, and we offer live chat support.' },
  { question: 'Does it work on Turbonet SIM?', answer: 'YieGo delivers data bundles to standard MTN, Telecel, and AirtelTigo SIM cards. Turbonet and other MVNO SIMs may not be supported. Contact support if unsure.' },
  { question: 'Why is my order delaying?', answer: 'Delivery is usually fast — most orders arrive within a few minutes. In rare cases delivery may take a few hours. If a bundle has not arrived after 12 hours, contact support@yiego.com or live chat with your Order ID.' },
  { question: 'Can I track orders without logging in?', answer: 'Yes, you can track any order using your Order ID on the Track Order page.' },
  { question: 'How do I contact support?', answer: 'Email support@yiego.com or use the in-app live chat.' },
  { question: 'What networks does YieGo support?', answer: 'YieGo supports all three major networks in Ghana: MTN, Telecel (formerly Vodafone Ghana), and AirtelTigo.' },
  { question: 'Is Mobile Money (MoMo) accepted?', answer: 'Yes — MTN MoMo, Telecel Cash, and AirtelTigo Money via Paystack. Visa and Mastercard are also accepted, as well as your YieGo wallet.' },
];

const ALL_FAQS = [...FAQ_DATA, ...EXTRA_FAQS];

const FAQ = () => {
  return (
    <Layout>
      <SEOHead
        title="FAQ — Frequently Asked Questions About Buying Data in Ghana | YieGo"
        description="Find answers to common questions about buying data bundles in Ghana. Learn about delivery times, payment methods, supported networks, and more on YieGo."
        path="/faq"
      />
      <FAQStructuredData faqs={ALL_FAQS} />

      <div className="container py-8 md:py-12 max-w-2xl">
        <Breadcrumbs items={[{ label: 'FAQ' }]} />

        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mx-auto mb-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]">
            <HelpCircle className="w-8 h-8 text-primary" />
          </div>
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Knowledge Base</span>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-2 tracking-tight">Frequently Asked Questions</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">Quick answers to common questions about buying data bundles with YieGo</p>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {ALL_FAQS.map((faq, i) => (
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
      </div>
    </Layout>
  );
};

export default FAQ;
