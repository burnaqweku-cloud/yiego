import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Smartphone } from 'lucide-react';

const FinalCTA = () => {
  return (
    <section className="container py-20 md:py-28">
      <div className="relative overflow-hidden rounded-[2rem] border border-primary/30 p-10 md:p-16 bg-gradient-to-br from-primary/15 via-card to-card">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-extrabold tracking-[-0.025em] leading-tight">
              Ready to ditch <br /> the <span className="line-through text-muted-foreground/70">old way</span> of topping up?
            </h2>
            <p className="text-muted-foreground mt-4 max-w-md">
              Join thousands of Ghanaians using YieGo as their everyday digital wallet. Free to create, free to fund, free to use.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row md:justify-end gap-3">
            <Link to="/auth?tab=signup">
              <Button size="lg" className="rounded-full h-12 px-7 font-bold gap-2 w-full sm:w-auto">
                Create free account <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/buy-data">
              <Button size="lg" variant="outline" className="rounded-full h-12 px-7 font-semibold gap-2 w-full sm:w-auto">
                <Smartphone className="w-4 h-4" /> Try without account
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
