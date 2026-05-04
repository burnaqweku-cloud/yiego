import AgentLayout from './AgentLayout';
import SEOHead from '@/components/seo/SEOHead';

const AgentSupport = () => {
  return (
    <AgentLayout>
      <SEOHead title="Agent Support | YieGo" description="Get help with your agent account" path="/agent/support" noIndex />
      <div className="max-w-2xl p-4">
        <div className="space-y-3 mb-8">
          <h1 className="text-xl font-display font-bold">Agent Support</h1>
          <p className="text-muted-foreground text-sm">
            Use the floating chat icon at the bottom-left to speak with our AI assistant for instant help with your agent account.
          </p>
          <p className="text-muted-foreground text-sm">
            For urgent issues, email <a href="mailto:support@yiego.com" className="text-primary font-medium hover:underline">support@yiego.com</a>
          </p>
        </div>
      </div>
    </AgentLayout>
  );
};

export default AgentSupport;
