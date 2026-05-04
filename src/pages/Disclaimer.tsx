import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

// Update these strings to change the dates site-wide
const EFFECTIVE_DATE = 'February 18, 2025';
const LAST_UPDATED = 'February 18, 2025';
const VERSION = 'v1.0';

const sections = [
  {
    number: '1',
    title: 'Service Dependency on Telecom Networks',
    content: "DataSika's data delivery service relies on telecom providers and third-party processing systems. Delivery performance may be affected by network congestion, provider system downtime, or telecom restrictions. DataSika cannot guarantee uninterrupted or instant delivery at all times.",
  },
  {
    number: '2',
    title: 'No Guarantee of Delivery Speed',
    content: 'While DataSika aims to process and deliver bundles as quickly as possible, delivery times may vary and are not guaranteed.',
  },
  {
    number: '3',
    title: 'Accuracy of Order Status',
    content: 'Order status updates displayed on the DataSika platform may not always reflect instantly. A delay in status update does not necessarily mean the data has not been delivered.',
  },
  {
    number: '4',
    title: 'Wrong Number Responsibility',
    content: 'Users are solely responsible for entering the correct phone number and selecting the correct network. Once a bundle is delivered, it cannot be reversed. DataSika will not be responsible for any losses resulting from user mistakes.',
  },
  {
    number: '5',
    title: 'Airtime Debt and SIM Restrictions',
    content: 'Data bundle delivery may fail or delay if the recipient number owes airtime, has telecom restrictions, or uses unsupported SIM card types. Such issues are outside DataSika\'s control.',
  },
  {
    number: '6',
    title: 'Payment Processing Disclaimer',
    content: 'Payments are processed through third-party payment providers. DataSika is not responsible for payment delays, transaction fees, or service interruptions caused by payment processors.',
  },
  {
    number: '7',
    title: 'Agent Program Disclaimer',
    content: 'DataSika provides a platform for approved agents to operate reseller stores. Agents may set their own prices. DataSika is not responsible for agent pricing decisions, customer-agent agreements, or agent profit margins.',
  },
  {
    number: '8',
    title: 'Limitation of Liability',
    content: 'DataSika shall not be liable for any direct or indirect damages, losses, or inconvenience resulting from delays, service interruptions, or third-party system failures.',
  },
  {
    number: '9',
    title: 'Platform Updates',
    content: 'DataSika may update its systems, pricing, services, and policies at any time without prior notice.',
  },
  {
    number: '10',
    title: 'Use at Your Own Risk',
    content: 'Your use of DataSika is at your own risk. DataSika makes no warranties, express or implied, regarding uninterrupted service availability.',
  },
];

const Disclaimer = () => {
  return (
    <Layout>
      <SEOHead
        title="Disclaimer | DataSika"
        description="Read the DataSika platform disclaimer. Understand limitations of liability, telecom delivery dependencies, and agent program terms for Ghana data bundle purchases."
        path="/disclaimer"
      />
      <div className="container py-8 md:py-14 max-w-2xl">
        <Breadcrumbs items={[{ label: 'Disclaimer' }]} />

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors duration-150"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        {/* Header card */}
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 card-shadow mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-warning" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold">DataSika Disclaimer</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span>Effective Date: <strong className="text-foreground">{EFFECTIVE_DATE}</strong></span>
                <span>Last Updated: <strong className="text-foreground">{LAST_UPDATED}</strong></span>
                <span>Version: <strong className="text-foreground">{VERSION}</strong></span>
              </div>
            </div>
          </div>

          <p className="mt-5 text-sm text-muted-foreground leading-relaxed">
            The information and services provided on the DataSika platform are for general convenience and digital service delivery purposes. By using DataSika, you acknowledge and agree to the following:
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.number} className="bg-card border border-border rounded-xl p-5 md:p-6 card-shadow">
              <h2 className="font-display font-semibold text-base flex items-start gap-2.5">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {section.number}
                </span>
                {section.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mt-3 pl-9">{section.content}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-destructive/5 border border-destructive/20 rounded-xl p-5 text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Important:</strong> If you do not agree with this disclaimer, you must discontinue the use of the DataSika platform.
        </div>

        <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-primary transition-colors duration-150">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-primary transition-colors duration-150">Privacy Policy</Link>
          <Link to="/support" className="hover:text-primary transition-colors duration-150">Contact Support</Link>
        </div>
      </div>
    </Layout>
  );
};

export default Disclaimer;
