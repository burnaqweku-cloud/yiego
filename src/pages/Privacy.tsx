import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

// Update these strings to change the dates site-wide
export const PRIVACY_EFFECTIVE_DATE = 'February 18, 2025';
export const PRIVACY_LAST_UPDATED = 'February 18, 2025';
export const PRIVACY_VERSION = 'v1.0';

const Privacy = () => {
  return (
    <Layout>
      <SEOHead
        title="Privacy Policy | YieGo"
        description="YieGo's privacy policy. Learn how we collect, use, store, and protect your personal data when you buy data bundles in Ghana. We never sell your information."
        path="/privacy"
      />
      <div className="container py-8 md:py-14 max-w-2xl">
        <Breadcrumbs items={[{ label: 'Privacy Policy' }]} />

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors duration-150"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        {/* Header card */}
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 card-shadow mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold">YieGo Privacy Policy</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span>Effective Date: <strong className="text-foreground">{PRIVACY_EFFECTIVE_DATE}</strong></span>
                <span>Last Updated: <strong className="text-foreground">{PRIVACY_LAST_UPDATED}</strong></span>
                <span>Version: <strong className="text-foreground">{PRIVACY_VERSION}</strong></span>
              </div>
            </div>
          </div>
          <p className="mt-5 text-sm text-muted-foreground leading-relaxed">
            YieGo ("we," "our," "us") respects your privacy and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, share, and protect your information when you use our website, services, and related platforms (collectively, the "Service").
          </p>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            By accessing or using YieGo, you agree to the collection and use of information in accordance with this Privacy Policy.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-6">

          <Section number="1" title="Who We Are">
            <p className="text-sm text-muted-foreground">YieGo is an online platform that enables users to purchase and send mobile data bundles across supported telecom networks in Ghana. YieGo may also provide an agent/reseller system that allows approved agents to sell data bundles through their own store links.</p>
          </Section>

          <Section number="2" title="Information We Collect">
            <SubSection title="2.1 Personal Information">
              <p className="text-sm text-muted-foreground">This includes information that can identify you directly, such as your full name, email address, phone number, username, and password (stored securely in encrypted form).</p>
            </SubSection>
            <SubSection title="2.2 Transaction Information">
              <p className="text-sm text-muted-foreground">When you place an order or make a payment, we may collect: recipient phone number, network selected, bundle size and type, payment amount, transaction reference IDs, order status and delivery records, and order timestamps and history.</p>
            </SubSection>
            <SubSection title="2.3 Agent Information">
              <p className="text-sm text-muted-foreground">If you apply to become an agent, we may collect additional details such as store name, store link or profile information, sales performance data, agent registration details, and subscription payment confirmation.</p>
            </SubSection>
            <SubSection title="2.4 Device and Usage Information">
              <p className="text-sm text-muted-foreground">We may automatically collect certain technical information such as IP address, browser type and version, device type and operating system, pages visited and time spent, login activity, and location data (approximate, based on IP).</p>
            </SubSection>
            <SubSection title="2.5 Customer Support Information">
              <p className="text-sm text-muted-foreground">If you contact support, we may collect your messages, support tickets and attachments, screenshots or proof of payment shared by you, and communication logs for quality and security purposes.</p>
            </SubSection>
          </Section>

          <Section number="3" title="How We Use Your Information">
            <SubSection title="3.1 To Provide Our Services">
              <p className="text-sm text-muted-foreground">Create and manage your YieGo account, process data bundle purchases and deliveries, validate payments and confirm transactions, display order history and status updates, and provide agent store and agent order tracking.</p>
            </SubSection>
            <SubSection title="3.2 To Improve Our Platform">
              <p className="text-sm text-muted-foreground">Monitor platform performance, detect and fix bugs or errors, and improve user experience and delivery reliability.</p>
            </SubSection>
            <SubSection title="3.3 To Communicate With You">
              <p className="text-sm text-muted-foreground">Send order confirmations and updates, respond to support requests, send important service announcements, and notify agents of updates or policy changes.</p>
            </SubSection>
            <SubSection title="3.4 For Security and Fraud Prevention">
              <p className="text-sm text-muted-foreground">Detect suspicious activity, prevent unauthorized access, protect user accounts and platform integrity, and enforce our Terms of Service.</p>
            </SubSection>
            <SubSection title="3.5 For Legal and Compliance Purposes">
              <p className="text-sm text-muted-foreground">Maintain transaction logs for auditing and comply with lawful requests from regulators or law enforcement when required.</p>
            </SubSection>
          </Section>

          <Section number="4" title="Legal Basis for Processing">
            <p className="text-sm text-muted-foreground">We process your personal information under the following lawful bases:</p>
            <ul className="list-disc pl-4 mt-2 space-y-1 text-sm text-muted-foreground marker:text-muted-foreground">
              <li>To perform a contract (to deliver data bundles after payment)</li>
              <li>Consent (when you voluntarily submit information)</li>
              <li>Legitimate interests (fraud prevention, security, service improvement)</li>
              <li>Legal obligations (when required by Ghanaian law or regulators)</li>
            </ul>
          </Section>

          <Section number="5" title="How We Share Your Information">
            <p className="text-sm text-muted-foreground font-medium text-foreground">We do not sell your personal information.</p>
            <p className="text-sm text-muted-foreground mt-2">However, we may share information with trusted third parties only when necessary to provide our services.</p>
            <SubSection title="5.1 Payment Providers">
              <p className="text-sm text-muted-foreground">We may share payment-related information with payment processors such as Paystack and Mobile Money payment partners.</p>
            </SubSection>
            <SubSection title="5.2 Telecom/Data Delivery Partners">
              <p className="text-sm text-muted-foreground">To complete your order, we may share recipient phone number, network selection, and bundle request details.</p>
            </SubSection>
            <SubSection title="5.3 Service Providers">
              <p className="text-sm text-muted-foreground">We may share limited data with service providers such as hosting providers, analytics tools, database and infrastructure providers, and notification and email providers.</p>
            </SubSection>
            <SubSection title="5.4 Legal Authorities">
              <p className="text-sm text-muted-foreground">We may disclose your information if required to comply with a legal obligation, respond to court orders or lawful government requests, or investigate fraud, security threats, or illegal activity.</p>
            </SubSection>
          </Section>

          <Section number="6" title="Agent System and Customer Data">
            <p className="text-sm text-muted-foreground">If you purchase from an agent store link, the agent may have access to limited information related to the order, such as order amount, order status, bundle type and size, and timestamp.</p>
            <p className="text-sm text-muted-foreground mt-2">Agents do not have access to sensitive payment details such as your Mobile Money PIN, Paystack card details, or full payment authorization information. YieGo maintains a complete record of transactions for audit and support purposes.</p>
          </Section>

          <Section number="7" title="Cookies and Tracking Technologies">
            <p className="text-sm text-muted-foreground">YieGo may use cookies and similar tracking technologies to keep you logged in, improve website performance, remember your preferences, prevent fraudulent activity, and track user behavior to improve service quality.</p>
            <p className="text-sm text-muted-foreground mt-2">You can disable cookies in your browser settings, but some platform features may not work properly.</p>
          </Section>

          <Section number="8" title="Data Storage and Security">
            <p className="text-sm text-muted-foreground">We apply industry-standard measures to protect your information, including encrypted password storage, secure payment processing systems, firewalls and server protections, restricted access to sensitive information, and monitoring for suspicious activities.</p>
            <p className="text-sm text-muted-foreground mt-2">However, no system is 100% secure. By using YieGo, you acknowledge that online transmission carries some risk.</p>
          </Section>

          <Section number="9" title="Data Retention">
            <p className="text-sm text-muted-foreground">We retain personal and transaction information as long as necessary to provide services, maintain accurate records, resolve disputes, comply with legal obligations, and prevent fraud and abuse. Some transaction records may be retained even after account deletion for compliance and auditing purposes.</p>
          </Section>

          <Section number="10" title="Your Rights">
            <p className="text-sm text-muted-foreground">Depending on applicable laws, you may have the right to:</p>
            <ul className="list-disc pl-4 mt-2 space-y-1 text-sm text-muted-foreground marker:text-muted-foreground">
              <li>Request access to your personal information</li>
              <li>Request correction of incorrect information</li>
              <li>Request deletion of your account (subject to retention requirements)</li>
              <li>Request limitation of processing</li>
              <li>Object to certain processing activities</li>
              <li>Withdraw consent where applicable</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">To request any of these actions, contact us through our official support channels.</p>
          </Section>

          <Section number="11" title="Account Deletion">
            <p className="text-sm text-muted-foreground">If you wish to delete your YieGo account, you may contact support. Once deleted, your personal profile may be removed, but transaction history may still be retained for compliance, fraud prevention, and accounting purposes.</p>
          </Section>

          <Section number="12" title="Third-Party Links">
            <p className="text-sm text-muted-foreground">YieGo may contain links to third-party websites or platforms. We are not responsible for the privacy practices or content of third-party websites.</p>
          </Section>

          <Section number="13" title="Children's Privacy">
            <p className="text-sm text-muted-foreground">YieGo is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from minors. If we become aware that a minor has provided personal data, we may delete it immediately.</p>
          </Section>

          <Section number="14" title="Changes to This Privacy Policy">
            <p className="text-sm text-muted-foreground">We may update this Privacy Policy from time to time. Any changes will be posted on this page, and the "Last Updated" date will be revised. Continued use of YieGo after updates means you accept the revised Privacy Policy.</p>
          </Section>

          <Section number="15" title="Contact Us">
            <p className="text-sm text-muted-foreground">If you have any questions about this Privacy Policy or how your data is handled, you may contact us through our official support channels:</p>
            <ul className="list-disc pl-4 mt-2 space-y-1 text-sm text-muted-foreground marker:text-muted-foreground">
              <li>Email: support@yiego.com</li>
              <li><Link to="/support" className="text-primary hover:underline">Support Page</Link></li>
            </ul>
          </Section>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-primary transition-colors duration-150">Terms of Service</Link>
          
          <Link to="/support" className="hover:text-primary transition-colors duration-150">Contact Support</Link>
        </div>
      </div>
    </Layout>
  );
};

const Section = ({ number, title, children }: { number: string; title: string; children: React.ReactNode }) => (
  <div className="bg-card border border-border rounded-xl p-5 md:p-6 card-shadow">
    <h2 className="font-display font-semibold text-base flex items-center gap-2.5 mb-4">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
        {number}
      </span>
      {title}
    </h2>
    <div className="pl-9 space-y-3">{children}</div>
  </div>
);

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="text-sm font-semibold text-foreground mb-1.5">{title}</h3>
    {children}
  </div>
);

export default Privacy;
