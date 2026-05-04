import DashboardLayout from '@/components/dashboard/DashboardLayout';
import SEOHead from '@/components/seo/SEOHead';
import AISupportChat from '@/components/support/AISupportChat';
import { useAuth } from '@/hooks/useAuth';

const DashboardSupport = () => {
  const { profile } = useAuth();

  return (
    <DashboardLayout>
      <SEOHead title="Support | YieGo" description="Get help with your YieGo account" path="/dashboard/support" noIndex />
      <div className="p-4 md:p-6 max-w-2xl">
        <div className="space-y-3 mb-8">
          <h1 className="text-xl font-display font-bold">Support</h1>
          <p className="text-muted-foreground text-sm">
            Chat with our AI assistant for instant help, or contact support@yiego.com
          </p>
        </div>
      </div>
      <AISupportChat context={{ page: 'dashboard/support', userType: 'user', username: profile?.username || undefined, email: profile?.email || undefined }} />
    </DashboardLayout>
  );
};

export default DashboardSupport;
