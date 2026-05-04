import { MessageCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { Link } from 'react-router-dom';

const SupportSection = () => {
  const ref = useScrollReveal();

  return (
    <section className="py-16 md:py-24" ref={ref}>
      <div className="container">
        <div className="max-w-2xl mx-auto reveal-on-scroll">
          <div className="surface-premium rounded-3xl p-8 md:p-12 text-center shadow-[0_20px_60px_-30px_hsl(var(--primary)/0.25)]">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mx-auto mb-6 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]">
              <MessageCircle className="w-7 h-7 text-primary" />
            </div>
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Support</span>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-3 tracking-tight">Need Help?</h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto text-sm leading-relaxed">
              Our AI support assistant can help you with orders, deposits, and any questions — instantly.
            </p>

            <Link to="/support">
              <Button variant="premium" className="gap-2.5 text-base px-8 h-12 rounded-xl font-bold btn-press">
                <MessageCircle className="w-5 h-5" />
                Visit Support Center
              </Button>
            </Link>

            <div className="flex items-center justify-center gap-2 mt-6 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>AI Support: 9 AM – 9 PM · support@datasika.com</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SupportSection;
