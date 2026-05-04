import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAgent } from '@/hooks/useAgent';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import AgentLandingHero from '@/components/agent/AgentLandingHero';
import AgentLandingBenefits from '@/components/agent/AgentLandingBenefits';
import AgentLandingHowItWorks from '@/components/agent/AgentLandingHowItWorks';
import AgentLandingRequirements from '@/components/agent/AgentLandingRequirements';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Smart router for /agent
 * - Logged-in agents with status → redirects to correct page
 * - Logged-in non-agents OR logged-out users → premium landing page
 */
const AgentRouter = () => {
  const { user, loading: authLoading } = useAuth();
  const { agent, application, loading: agentLoading, isActiveAgent, isPending, isAwaitingPayment, needsActivation, isRejected, isSuspended } = useAgent();
  const navigate = useNavigate();

  // Still loading auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  // Logged-in user with agent status → smart redirect
  if (user && !agentLoading) {
    if (isActiveAgent) return <Navigate to="/agent/dashboard" replace />;
    if (isPending) return <Navigate to="/agent/dashboard" replace />;
    if (needsActivation || isAwaitingPayment) return <Navigate to="/agent/dashboard" replace />;
    if (isSuspended || isRejected) return <Navigate to="/become-an-agent" replace />;
    if (agent) return <Navigate to="/become-an-agent" replace />;
    if (application && application.status === 'pending') return <Navigate to="/agent/dashboard" replace />;
  }

  // If still loading agent data for logged-in user, show spinner
  if (user && agentLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  // Show premium landing page (for logged-out users OR logged-in users with no agent/application)
  const handleCTA = () => {
    if (user) {
      navigate('/become-an-agent');
    } else {
      navigate('/auth?redirect=/become-an-agent');
    }
  };

  return (
    <Layout>
      <SEOHead
        title="Become a YieGo Agent — Sell Data & Earn | YieGo"
        description="Join YieGo as an agent. Sell MTN, Telecel & AirtelTigo data bundles, set your own prices, and earn commissions."
        path="/agent"
      />
      <div className="animate-page-in">
        <AgentLandingHero />
        <AgentLandingBenefits />
        <AgentLandingHowItWorks />
        <AgentLandingRequirements />

        {/* Bottom CTA */}
        <section className="px-4 pb-12 sm:pb-16 max-w-md mx-auto text-center">
          <Button onClick={handleCTA} size="lg" className="w-full sm:w-auto gap-2 btn-press text-base">
            <Zap className="w-4 h-4" />
            Start Application
            <ArrowRight className="w-4 h-4" />
          </Button>
          {!user && (
            <p className="text-xs text-muted-foreground mt-3">
              You'll need to log in or create an account first.
            </p>
          )}
        </section>
      </div>
    </Layout>
  );
};

export default AgentRouter;
