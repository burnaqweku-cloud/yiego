import { Link } from 'react-router-dom';
import { FAQ_DATA } from '@/data/bundles';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowRight } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const FAQPreview = () => {
  const previewFaqs = FAQ_DATA.slice(0, 4);
  const ref = useScrollReveal();

  return (
    <section className="py-16 md:py-24" ref={ref}>
      <div className="container">
        <div className="text-center mb-12 reveal-on-scroll">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">FAQ</span>
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">Frequently Asked Questions</h2>
          <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">Quick answers to common questions</p>
        </div>

        <div className="max-w-2xl mx-auto reveal-on-scroll">
          <Accordion type="single" collapsible className="space-y-3">
            {previewFaqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="surface-premium rounded-2xl px-6 data-[state=open]:ring-1 data-[state=open]:ring-primary/30 transition-all"
              >
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4 text-sm">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4 text-sm leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="text-center mt-10">
            <Link to="/faq">
              <Button variant="outline" className="gap-2 btn-press">
                View All FAQs
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQPreview;
