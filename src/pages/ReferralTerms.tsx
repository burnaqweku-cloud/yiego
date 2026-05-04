import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import { Shield } from 'lucide-react';

const ReferralTerms = () => {
  return (
    <Layout>
      <SEOHead title="Referral Program Terms — YieGo" description="Terms and conditions for the YieGo referral rewards program." path="/referral-terms" noIndex />
      <div className="container max-w-2xl py-10 md:py-16">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Referral Program Terms & Conditions</h1>
        </div>

        <div className="bg-card rounded-2xl p-6 border border-border space-y-5 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-bold text-foreground mb-2">1. Eligibility</h2>
            <p>All registered YieGo users with verified accounts are eligible to participate in the referral program. Each user receives a unique referral code and link upon registration.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">2. Qualification Rules</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Only the <strong>first successful paid order</strong> by a referred user counts toward your referral milestones.</li>
              <li>An order qualifies when payment is confirmed and the supplier delivery request is successfully initiated.</li>
              <li>Subsequent purchases by the same referred user do not count as additional referrals.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">3. Prohibited Activities</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Self-referral</strong> — Referring yourself using multiple accounts is strictly prohibited.</li>
              <li><strong>Duplicate accounts</strong> — Creating multiple accounts to inflate referral numbers is forbidden.</li>
              <li><strong>Fake purchases</strong> — Placing orders solely to qualify referrals without genuine intent is not allowed.</li>
              <li><strong>Device/IP abuse</strong> — Using the same device or network to create multiple referred accounts will be flagged.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">4. Monitoring & Enforcement</h2>
            <p>YieGo monitors referral activity for suspicious patterns including but not limited to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>Same device fingerprint across referrer and referred accounts</li>
              <li>Unusual IP address clustering among referred accounts</li>
              <li>Abnormally high referral velocity</li>
              <li>Duplicate phone numbers across accounts</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">5. Consequences of Violations</h2>
            <p>Suspicious activity may result in:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li><strong>Referral reward suspension</strong> — Rewards may be frozen pending review.</li>
              <li><strong>Account freeze</strong> — Your account may be temporarily frozen while under investigation.</li>
              <li><strong>Permanent ban</strong> — Repeated or severe violations may result in permanent account suspension.</li>
            </ul>
            <p className="mt-2">All enforcement actions are reviewed by an admin before any penalties are applied. No automatic bans occur.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">6. Reward Delivery</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Rewards are delivered as data bundles to the phone number you specify during the claim process.</li>
              <li>Delivery is processed after admin verification and is non-refundable.</li>
              <li>The maximum total reward from the referral ladder is 25GB.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">7. Admin Decision</h2>
            <p>YieGo reserves the right to modify, suspend, or terminate the referral program at any time. All admin decisions regarding referral disputes are final.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">8. Contact</h2>
            <p>For questions about the referral program, contact <a href="mailto:support@yiego.com" className="text-primary hover:underline">support@yiego.com</a>.</p>
          </section>

          <p className="text-xs text-muted-foreground/60 pt-2 border-t border-border">Last updated: February 2026</p>
        </div>
      </div>
    </Layout>
  );
};

export default ReferralTerms;
