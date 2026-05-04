import { Link } from 'react-router-dom';
import { Wallet, ClipboardList, Zap, ShieldCheck, Headphones, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const benefits = [
  { icon: Wallet, title: 'Wallet System', desc: 'Load your wallet for faster checkout' },
  { icon: ClipboardList, title: 'Order History', desc: 'Track all your past purchases' },
  { icon: Zap, title: 'Faster Checkout', desc: 'Skip the form—saved details' },
  { icon: ShieldCheck, title: 'Secure Account', desc: 'Your data is encrypted & safe' },
  { icon: Headphones, title: 'Priority Support', desc: 'Get help faster as a member' },
];

const AccountBenefits = () => {
  const ref = useScrollReveal();

  return (
    <section className="bg-secondary/50 py-16 md:py-24" ref={ref}>
      <div className="container">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 reveal-on-scroll">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">Free Account</span>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">Unlock the Full Experience</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
              Buy data as a guest anytime — but creating a free account gives you access to powerful features.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-10 reveal-stagger">
            {benefits.map((b) => (
              <div key={b.title} className="reveal-on-scroll surface-premium rounded-2xl p-4 text-center transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.25)]">
                <div className="w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mx-auto mb-3 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]">
                  <b.icon className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-display font-semibold text-xs mb-1 tracking-tight">{b.title}</h4>
                <p className="text-[10px] text-muted-foreground leading-snug">{b.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center reveal-on-scroll">
            <Link to="/auth?tab=signup">
              <Button className="gap-2.5 btn-press px-8 h-11 font-bold">
                Create Free Account
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-4">No obligation. You can still buy data without an account.</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AccountBenefits;
