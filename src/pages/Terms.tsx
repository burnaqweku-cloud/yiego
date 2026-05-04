import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

// Update these strings to change the dates site-wide
export const TERMS_EFFECTIVE_DATE = 'February 18, 2025';
export const TERMS_LAST_UPDATED = 'February 18, 2025';
export const TERMS_VERSION = 'v1.0';

const Terms = () => {
  return (
    <Layout>
      <SEOHead
        title="Terms of Service | YieGo"
        description="Read YieGo's terms of service. Learn about our data bundle delivery policies, payment terms, agent program rules, and refund process for MTN, Telecel & AirtelTigo in Ghana."
        path="/terms"
      />
      <div className="container py-8 md:py-14 max-w-2xl">
        <Breadcrumbs items={[{ label: 'Terms of Service' }]} />

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
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold">YieGo Terms of Service</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span>Effective Date: <strong className="text-foreground">{TERMS_EFFECTIVE_DATE}</strong></span>
                <span>Last Updated: <strong className="text-foreground">{TERMS_LAST_UPDATED}</strong></span>
                <span>Version: <strong className="text-foreground">{TERMS_VERSION}</strong></span>
              </div>
            </div>
          </div>
          <p className="mt-5 text-sm text-muted-foreground leading-relaxed">
            Welcome to YieGo ("YieGo", "we", "us", "our"). These Terms of Service ("Terms") govern your access to and use of the YieGo website, platform, services, and any related features, including our data bundle purchase services and agent reseller system (collectively, the "Service").
          </p>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            By accessing or using YieGo, you confirm that you have read, understood, and agreed to be bound by these Terms. If you do not agree with these Terms, you must not use the Service.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-6">

          <Section number="1" title="Eligibility and Account Registration">
            <ol className="list-decimal pl-4 space-y-2 text-sm text-muted-foreground marker:text-muted-foreground">
              <li>You must be at least 18 years old, or have permission from a parent or legal guardian, to use YieGo.</li>
              <li>You may be required to create an account to access certain features.</li>
              <li>You agree to provide accurate and complete information during registration.</li>
              <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
              <li>You are responsible for all activity that occurs under your account.</li>
            </ol>
            <p className="text-sm text-muted-foreground mt-3">YieGo is not responsible for unauthorized access resulting from your failure to secure your account.</p>
          </Section>

          <Section number="2" title="Services Provided">
            <p className="text-sm text-muted-foreground">YieGo provides a digital platform that allows users to purchase and deliver mobile data bundles for supported Ghanaian telecom networks, including but not limited to:</p>
            <ul className="list-disc pl-4 mt-2 space-y-1 text-sm text-muted-foreground marker:text-muted-foreground">
              <li>MTN Ghana</li>
              <li>Telecel Ghana</li>
              <li>AirtelTigo</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">YieGo acts as a reseller and delivery facilitator. Data delivery is dependent on network availability, telecom provider processing, and system integration.</p>
            <p className="text-sm text-muted-foreground mt-2">We reserve the right to modify, suspend, or discontinue any part of the Service at any time without notice.</p>
          </Section>

          <Section number="3" title="Order Processing and Delivery">
            <SubSection title="3.1 Automated Delivery">
              <p className="text-sm text-muted-foreground">Most data bundle purchases are processed automatically once payment is successfully verified.</p>
            </SubSection>
            <SubSection title="3.2 Delivery Delays">
              <p className="text-sm text-muted-foreground">While YieGo strives to ensure fast delivery, delivery time may vary due to factors beyond our control, including but not limited to: network congestion, telecom provider processing delays, system maintenance, high order volume, API delays or interruptions, and telecom restrictions or verification processes.</p>
            </SubSection>
            <SubSection title="3.3 Status Display Updates">
              <p className="text-sm text-muted-foreground">Order statuses may not update instantly at all times. In some cases, an order may show "Processing" even after the data has already been delivered, or may show "Delivered" but take a few minutes to reflect on the recipient number due to network confirmation delays. YieGo is not liable for minor status update delays.</p>
            </SubSection>
            <SubSection title="3.4 Duplicate Orders">
              <p className="text-sm text-muted-foreground">You must not place multiple orders for the same phone number while an earlier order is still processing, as this may cause delivery conflicts or delays.</p>
            </SubSection>
          </Section>

          <Section number="4" title="Airtime Debt and Unsupported Numbers">
            <p className="text-sm text-muted-foreground">Certain telecom networks may restrict the delivery of data bundles to numbers that owe airtime or credit, are restricted by telecom policies, are flagged for unusual activity, or are unsupported by the telecom's bundle delivery system.</p>
            <p className="text-sm text-muted-foreground mt-2">If the recipient number owes airtime or has restrictions, delivery may delay or fail. YieGo is not responsible for failures caused by the recipient's telecom status. Additionally, some SIM types (including certain TurboNet SIM cards) may not be supported for bundle delivery.</p>
          </Section>

          <Section number="5" title="Payments">
            <SubSection title="5.1 Payment Methods">
              <p className="text-sm text-muted-foreground">YieGo accepts payments through supported channels such as Mobile Money (MoMo) and Paystack or other supported payment processors.</p>
            </SubSection>
            <SubSection title="5.2 Payment Confirmation">
              <p className="text-sm text-muted-foreground">Orders are processed only after payment is verified by our payment provider. In some cases, payment confirmation may delay due to network issues or payment processor delays.</p>
            </SubSection>
            <SubSection title="5.3 Fees and Charges">
              <p className="text-sm text-muted-foreground">Payment processors may apply transaction charges, service fees, or taxes. These charges are determined by the payment provider and may not be controlled by YieGo. By using YieGo, you acknowledge that transaction charges may apply depending on your payment method.</p>
            </SubSection>
          </Section>

          <Section number="6" title="Wallet Funding and Account Usage">
            <p className="text-sm text-muted-foreground">YieGo may provide users with wallet-related features for convenience. Wallet balances can be used for purchases, subject to platform policies. Wallet deposits and withdrawals may be subject to verification and processing time. You are advised to always make purchases while logged into your YieGo account for easier tracking and support resolution.</p>
          </Section>

          <Section number="7" title="Pricing and Availability">
            <p className="text-sm text-muted-foreground">All prices displayed on YieGo are in Ghana Cedis (GHS) unless stated otherwise. Prices may change at any time due to supplier price changes, network changes, or operational adjustments. YieGo reserves the right to update pricing without prior notice.</p>
          </Section>

          <Section number="8" title="Wrong Number Policy">
            <p className="text-sm text-muted-foreground">You are solely responsible for entering the correct recipient phone number before confirming your purchase. Once a data bundle is delivered to a phone number, the transaction cannot be reversed or recovered. YieGo will not be responsible for losses caused by wrong phone number entry, incorrect network selection, or user mistakes during checkout.</p>
          </Section>

          <Section number="9" title="Refund Policy">
            <SubSection title="9.1 No Refunds for Successful Delivery">
              <p className="text-sm text-muted-foreground">If an order is successfully delivered, it is final and non-refundable.</p>
            </SubSection>
            <SubSection title="9.2 Refunds for Failed Orders">
              <p className="text-sm text-muted-foreground">Refunds may be considered only in cases where payment was successful but the order was not created, payment was successful but the order permanently failed, or a system error caused a verified failed transaction. Refunds are processed only after internal verification.</p>
            </SubSection>
            <SubSection title="9.3 Processing Orders">
              <p className="text-sm text-muted-foreground">If an order status shows "Processing", the order is still in progress and will typically be delivered automatically. Processing orders are not eligible for refunds unless confirmed failed after investigation.</p>
            </SubSection>
          </Section>

          <Section number="10" title="Agents and Reseller Program">
            <p className="text-sm text-muted-foreground">YieGo offers an Agent Program that allows approved users ("Agents") to operate a personal YieGo store link and set their own selling prices above the base agent prices provided by YieGo.</p>
            <SubSection title="10.1 Agent Approval">
              <p className="text-sm text-muted-foreground">Agent applications are subject to review and approval. YieGo reserves the right to approve or reject any application at its discretion.</p>
            </SubSection>
            <SubSection title="10.2 Agent Pricing">
              <p className="text-sm text-muted-foreground">Agents may set their own prices, and their profits are based on the difference between the base agent price and the agent's selling price. YieGo is not responsible for prices set by agents, agent profit margins, or agent business decisions.</p>
            </SubSection>
            <SubSection title="10.3 Customer-Agent Relationship">
              <p className="text-sm text-muted-foreground">Customers who purchase through an agent's store link are purchasing through that agent's store system. Agents are expected to provide basic customer assistance and communication. However, YieGo remains responsible for the platform's technical delivery process.</p>
            </SubSection>
            <SubSection title="10.4 Misuse and Termination">
              <p className="text-sm text-muted-foreground">YieGo may suspend or terminate any agent account for fraudulent activity, abuse of the platform, misrepresentation, violations of these Terms, or harmful or unethical business practices.</p>
            </SubSection>
          </Section>

          <Section number="11" title="Prohibited Activities">
            <p className="text-sm text-muted-foreground">You agree not to use YieGo for any unlawful, abusive, or harmful purpose. Prohibited activities include but are not limited to:</p>
            <ul className="list-disc pl-4 mt-2 space-y-1 text-sm text-muted-foreground marker:text-muted-foreground">
              <li>Attempting to reverse-engineer or exploit the platform</li>
              <li>Using YieGo to commit fraud</li>
              <li>Providing false payment confirmations</li>
              <li>Using stolen payment accounts</li>
              <li>Misusing the agent system</li>
              <li>Spamming or attempting to overload the Service</li>
              <li>Unauthorized access attempts</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">Violations may result in immediate account suspension and possible legal action.</p>
          </Section>

          <Section number="12" title="System Availability and Maintenance">
            <p className="text-sm text-muted-foreground">YieGo may occasionally perform system upgrades or maintenance that could temporarily interrupt service availability. We do not guarantee uninterrupted access to the Service.</p>
          </Section>

          <Section number="13" title="Limitation of Liability">
            <p className="text-sm text-muted-foreground">To the maximum extent permitted by law, YieGo shall not be liable for any loss, damages, or claims arising from: telecom provider delays or failures, network congestion or downtime, payment processor delays, wrong phone number submissions, airtime debt restrictions, unsupported SIM card issues, temporary system outages, or delays caused by high order volume.</p>
            <p className="text-sm text-muted-foreground mt-2">YieGo's liability, if any, shall not exceed the total amount paid by the user for the specific transaction under dispute.</p>
          </Section>

          <Section number="14" title="Indemnification">
            <p className="text-sm text-muted-foreground">You agree to indemnify and hold harmless YieGo, its owners, staff, and partners from any claims, liabilities, damages, losses, or expenses arising from your misuse of the Service, your violation of these Terms, or your fraudulent or unlawful actions.</p>
          </Section>

          <Section number="15" title="Privacy Policy">
            <p className="text-sm text-muted-foreground">Your use of YieGo is also governed by our <Link to="/privacy" className="text-primary hover:underline font-medium">Privacy Policy</Link>. By using YieGo, you consent to the collection and processing of your data as described in our Privacy Policy.</p>
          </Section>

          <Section number="16" title="Changes to These Terms">
            <p className="text-sm text-muted-foreground">YieGo may update or modify these Terms at any time. Updates will become effective immediately upon posting on our website. Continued use of the Service after updates means you accept the revised Terms.</p>
          </Section>

          <Section number="17" title="Termination of Service">
            <p className="text-sm text-muted-foreground">YieGo may suspend or terminate your access to the Service at any time, without notice, if you violate these Terms, engage in fraud or suspicious transactions, abuse the platform, or harm the platform or other users. Termination may result in loss of access to your account.</p>
          </Section>

          <Section number="18" title="Governing Law">
            <p className="text-sm text-muted-foreground">These Terms shall be governed by and interpreted in accordance with the laws of the Republic of Ghana. Any disputes shall be handled under the jurisdiction of Ghanaian courts.</p>
          </Section>

          <Section number="19" title="Contact Information">
            <p className="text-sm text-muted-foreground">For support or inquiries, you may contact YieGo through:</p>
            <ul className="list-disc pl-4 mt-2 space-y-1 text-sm text-muted-foreground marker:text-muted-foreground">
              <li><Link to="/support" className="text-primary hover:underline">WhatsApp Support</Link></li>
              <li>Email: support@yiego.com</li>
            </ul>
          </Section>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-primary transition-colors duration-150">Privacy Policy</Link>
          
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

export default Terms;
