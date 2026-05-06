import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, MessageCircle, ArrowRight } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

// Update these strings to change the dates site-wide
export const TERMS_EFFECTIVE_DATE = 'February 18, 2025';
export const TERMS_LAST_UPDATED = 'February 18, 2025';
export const TERMS_VERSION = 'v1.0';

const SECTIONS = [
  { id: 'who-can-use', title: 'Who Can Use YieGo' },
  { id: 'what-we-offer', title: 'What YieGo Offers' },
  { id: 'how-orders-work', title: 'How Orders Work' },
  { id: 'network-limits', title: 'Network and SIM Limitations' },
  { id: 'paying', title: 'Paying for Orders' },
  { id: 'wallet', title: 'The YieGo Wallet' },
  { id: 'pricing', title: 'Prices and Currency' },
  { id: 'recipient-final', title: 'Recipient Details Are Final' },
  { id: 'refunds', title: 'Refunds and Reversals' },
  { id: 'agents', title: 'The Agent Program' },
  { id: 'prohibited', title: 'What You May Not Do' },
  { id: 'availability', title: 'Service Availability' },
  { id: 'liability', title: 'Limits on Our Responsibility' },
  { id: 'indemnity', title: 'Holding Us Harmless' },
  { id: 'privacy-link', title: 'Data and Privacy' },
  { id: 'updates', title: 'Updates to These Terms' },
  { id: 'closing', title: 'Closing Your Account' },
  { id: 'law', title: 'Applicable Law' },
  { id: 'contact', title: 'Reaching Us' },
];

const Terms = () => {
  return (
    <Layout>
      <SEOHead
        title="Terms of Service | YieGo"
        description="The Terms of Service that govern how you use YieGo — the everyday digital wallet for Ghana. Covers account use, orders, payments, wallet, agent program and more."
        path="/terms"
      />

      {/* ── HERO ── */}
      <section className="relative border-b border-border/40 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-card/60" />
          <div className="absolute -top-24 -right-12 w-[520px] h-[520px] rounded-full bg-primary/20 blur-3xl glow-drift" />
          <div className="absolute -bottom-32 -left-12 w-[400px] h-[400px] rounded-full bg-accent/10 blur-3xl glow-drift-slow" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
          />
          <div className="noise-overlay" />
        </div>

        <div className="container py-14 md:py-20 max-w-5xl">
          <Breadcrumbs items={[{ label: 'Terms of Service' }]} />

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors mt-2 mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>

          <div className="flex items-start gap-5">
            <div className="relative shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 flex items-center justify-center shadow-[0_12px_28px_-10px_hsl(var(--primary)/0.45),inset_0_1px_0_0_hsl(var(--primary)/0.3)]">
              <FileText className="w-6 h-6 text-primary" strokeWidth={1.9} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Legal</span>
              </div>
              <h1 className="text-3xl md:text-[2.6rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
                Terms of <span className="text-gradient">Service</span>
              </h1>
              <p className="text-muted-foreground text-[14px] mt-3 max-w-2xl leading-relaxed">
                The ground rules for using YieGo — how the platform works, what you agree to when you sign up, and the limits of our responsibility. Please read carefully before continuing.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[10.5px] font-medium text-muted-foreground">
                  Effective <span className="font-bold text-foreground tabular">{TERMS_EFFECTIVE_DATE}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[10.5px] font-medium text-muted-foreground">
                  Last updated <span className="font-bold text-foreground tabular">{TERMS_LAST_UPDATED}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-[10.5px] font-bold tabular text-primary uppercase tracking-wide">
                  {TERMS_VERSION}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BODY ── */}
      <div className="container py-12 max-w-5xl">
        <div className="grid lg:grid-cols-12 gap-10">
          {/* Sticky TOC */}
          <aside className="hidden lg:block lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <div className="rounded-2xl border border-border/70 bg-card/70 backdrop-blur-md p-5 shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.2)]">
                <div className="flex items-center gap-2 mb-4">
                  <span className="h-px w-6 bg-gradient-to-r from-transparent to-primary" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">On this page</p>
                </div>
                <ol className="space-y-0.5 text-[12.5px] max-h-[60vh] overflow-y-auto pr-1">
                  {SECTIONS.map((s, i) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="flex items-start gap-3 py-1.5 px-2 rounded-lg text-foreground/70 hover:text-primary hover:bg-primary/5 transition-colors group"
                      >
                        <span className="text-[10.5px] tabular text-muted-foreground/60 group-hover:text-primary/80 font-semibold mt-0.5 w-5 shrink-0">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="leading-snug">{s.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </aside>

          {/* Sections */}
          <div className="lg:col-span-8 space-y-5">
            <Intro />

            <Section id="who-can-use" number={1} title="Who Can Use YieGo">
              <p>
                Access to YieGo is limited to people who are 18 years or older. Younger users may only interact with the platform under the direct supervision and consent of a parent or legal guardian.
              </p>
              <p>
                Some features require you to register an account. The information you submit during registration must be truthful, current and complete. The login credentials you set belong to you alone — keep them private, do not reuse them on other sites, and replace them immediately if you suspect they have been compromised.
              </p>
              <p>
                Anything that happens through your account is treated as your action. We are not liable for breaches caused by credentials you have shared, leaked, or failed to safeguard.
              </p>
            </Section>

            <Section id="what-we-offer" number={2} title="What YieGo Offers">
              <p>
                YieGo is a digital wallet platform built for Ghana. Its current core service is the purchase and delivery of mobile data bundles for the country's three major telecom providers — MTN Ghana, Telecel Ghana and AirtelTigo.
              </p>
              <p>
                Beyond data bundles, the platform also includes a stored-balance wallet that lets users hold funds and pay across services with a single tap, and an agent program that allows approved resellers to operate their own storefronts. Additional digital services — such as airtime top-ups, utility bill payments, subscription services and digital product vouchers — form part of the platform's broader scope and are introduced as they become operationally ready.
              </p>
              <p>
                YieGo functions as a facilitator between users and the underlying telecom and service providers. Successful delivery therefore depends on the availability and processing of those upstream systems. We may add, modify, pause, or retire any feature at our discretion and without prior notice.
              </p>
            </Section>

            <Section id="how-orders-work" number={3} title="How Orders Work">
              <SubSection title="3.1 Automatic processing">
                <p>
                  Once payment clears, your order is generally pushed straight through to the relevant provider with no manual intervention.
                </p>
              </SubSection>
              <SubSection title="3.2 Possible delays">
                <p>
                  Although the platform is engineered for speed, real-world delivery times can vary. Delays may stem from telecom-side processing queues, congestion on operator networks, scheduled or unscheduled maintenance, sudden spikes in order volume, third-party API outages, or verification checks performed by the destination provider. None of these factors are within our direct control.
                </p>
              </SubSection>
              <SubSection title="3.3 Status accuracy">
                <p>
                  The order status visible inside your account is a best-effort reflection of the platform's records. Because confirmations from telecom partners often arrive asynchronously, you may occasionally see a "Processing" label after the data has actually been delivered, or a "Delivered" label that takes a few extra minutes to appear on the recipient's line. Minor mismatches between displayed status and on-the-ground state are not grounds for liability.
                </p>
              </SubSection>
              <SubSection title="3.4 Back-to-back orders">
                <p>
                  Submitting consecutive orders for the same recipient number while a previous one is still in flight can confuse provider-side validation and lead to delivery conflicts. Please wait for the first order to settle before placing another for the same number.
                </p>
              </SubSection>
            </Section>

            <Section id="network-limits" number={4} title="Network and SIM Limitations">
              <p>
                Some telecom-side conditions can interfere with bundle delivery. Examples include — but are not limited to — a recipient line carrying an unpaid airtime balance, a number that has been restricted or flagged by the operator, devices showing unusual usage patterns, or SIM types (such as certain MVNO and TurboNet variants) that fall outside the operator's standard bundle-delivery channels.
              </p>
              <p>
                Where the recipient's status causes a delivery failure, the issue lies with the operator and not YieGo.
              </p>
            </Section>

            <Section id="paying" number={5} title="Paying for Orders">
              <SubSection title="5.1 Supported methods">
                <p>
                  You can pay using Mobile Money channels supported in Ghana, debit and credit cards processed through our payment partner, or your YieGo wallet balance.
                </p>
              </SubSection>
              <SubSection title="5.2 Confirmation timing">
                <p>
                  An order moves into processing only once the payment has been verified by the upstream payment partner. Delays in that verification — caused by network instability, intermittent gateway issues, or fraud-prevention checks — directly delay the order itself.
                </p>
              </SubSection>
              <SubSection title="5.3 Fees and taxes">
                <p>
                  Depending on the channel you choose, the payment partner may add a service fee, gateway charge or local tax to your transaction. These costs are determined by the partner, not YieGo, and the total you confirm at checkout always reflects them.
                </p>
              </SubSection>
            </Section>

            <Section id="wallet" number={6} title="The YieGo Wallet">
              <p>
                Your YieGo wallet is a stored-balance feature attached to your account. You can fund it once and spend across any of the platform's services without re-entering payment details for every order. Top-ups and withdrawals may be subject to identity, fraud, or compliance checks before being released, and the time taken for those checks varies.
              </p>
              <p>
                We strongly encourage placing all orders while signed in so wallet balances, history and support requests stay tied to a single profile.
              </p>
            </Section>

            <Section id="pricing" number={7} title="Prices and Currency">
              <p>
                All amounts shown on the platform are denominated in Ghanaian Cedis (GHS) unless stated otherwise. Prices reflect upstream supplier rates, network tariffs and our operational costs at the moment of display, all of which can shift.
              </p>
              <p>
                We may revise prices at any time without prior notice; the price valid for any individual transaction is the one displayed at the moment you confirm checkout.
              </p>
            </Section>

            <Section id="recipient-final" number={8} title="Recipient Details Are Final">
              <p>
                It is your responsibility to confirm the recipient's phone number, network, and bundle selection before submitting an order. After a successful delivery, the transaction cannot be reversed, recovered or transferred — funds and bundles cannot be reclaimed from a number that has already received them.
              </p>
              <p>
                Please double-check the digits before tapping pay. Mistakes such as wrong numbers, mistyped digits, or an incorrectly selected network are not grounds for refund.
              </p>
            </Section>

            <Section id="refunds" number={9} title="Refunds and Reversals">
              <SubSection title="9.1 Successful deliveries are final">
                <p>
                  When an order is successfully fulfilled, the transaction is closed and no longer eligible for refund.
                </p>
              </SubSection>
              <SubSection title="9.2 Verified failures">
                <p>
                  Refunds are reviewed in cases where money has been collected but the underlying order either was never created, permanently failed, or was rendered void by a verifiable system error. All refunds go through internal verification before being released.
                </p>
              </SubSection>
              <SubSection title='9.3 Orders still "Processing"'>
                <p>
                  Orders that remain in the "Processing" state are still actively being handled by the relevant provider and will typically settle on their own. Such orders are not refundable until our investigation has formally classified them as failed.
                </p>
              </SubSection>
            </Section>

            <Section id="agents" number={10} title="The Agent Program">
              <p>
                Approved members of the platform may sign up as Agents to operate a personalised storefront. Agents purchase at base agent pricing and resell at a margin they set themselves through their YieGo store link.
              </p>
              <SubSection title="10.1 Approval">
                <p>
                  Every application is screened, and admission is offered at YieGo's sole discretion. Approval is not guaranteed even if all submitted information is accurate.
                </p>
              </SubSection>
              <SubSection title="10.2 Agent-set pricing">
                <p>
                  Agents are free to set their own retail prices above the base supplier rate; the agent's profit on each order is the spread between that retail price and the base price. YieGo neither sets nor warrants Agent pricing, and we are not a party to commercial decisions made within an Agent's storefront.
                </p>
              </SubSection>
              <SubSection title="10.3 Customer–agent relationship">
                <p>
                  When a customer checks out via an Agent's store link, the commercial relationship for that order sits with the Agent. Agents are expected to handle direct customer queries promptly and professionally. YieGo retains responsibility for the underlying technical delivery process.
                </p>
              </SubSection>
              <SubSection title="10.4 Misuse and removal">
                <p>
                  Agent privileges may be suspended or revoked at any time if we detect fraud, deceptive marketing, abuse of platform features, false representations to customers, or any conduct that brings the YieGo brand into disrepute.
                </p>
              </SubSection>
            </Section>

            <Section id="prohibited" number={11} title="What You May Not Do">
              <p>
                You agree not to use YieGo in ways that are unlawful, harmful, or contrary to the spirit of the platform. Examples of conduct that will not be tolerated include:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 marker:text-primary/60">
                <li>Probing or attempting to reverse-engineer the platform.</li>
                <li>Submitting fabricated or misappropriated payment confirmations.</li>
                <li>Using payment instruments that are not lawfully yours.</li>
                <li>Gaming or exploiting the Agent system.</li>
                <li>Bombarding the platform with automated requests or scraping endpoints.</li>
                <li>Any unauthorised attempt to access accounts, systems or data that do not belong to you.</li>
              </ul>
              <p>
                Any of these actions may result in immediate suspension and, where appropriate, referral to the relevant authorities.
              </p>
            </Section>

            <Section id="availability" number={12} title="Service Availability">
              <p>
                From time to time the platform will be partially or fully unavailable while we deploy upgrades, perform maintenance, or address an incident. We do our best to schedule major work during off-peak hours, but uninterrupted access cannot be guaranteed and is not warranted.
              </p>
            </Section>

            <Section id="liability" number={13} title="Limits on Our Responsibility">
              <p>
                To the fullest extent permitted by Ghanaian law, YieGo is not liable for losses, damages, or claims that arise from circumstances outside its direct control. These include, without limitation: delays or failures on the part of telecom operators, network congestion or downtime, payment-gateway processing issues, recipient-number errors entered by the user, restrictions tied to airtime debt or SIM compatibility, scheduled or emergency platform downtime, and demand surges that exceed processing capacity.
              </p>
              <p>
                Where YieGo is found liable for any matter notwithstanding the above, that liability is capped at the amount actually paid for the specific transaction in question.
              </p>
            </Section>

            <Section id="indemnity" number={14} title="Holding Us Harmless">
              <p>
                You agree to defend, indemnify and keep YieGo (along with its founders, employees, contractors and partners) free of cost from any claim, liability, damage, loss, fine or expense — including reasonable legal fees — that arises from your misuse of the platform, your breach of these Terms, or any unlawful or fraudulent act on your part.
              </p>
            </Section>

            <Section id="privacy-link" number={15} title="Data and Privacy">
              <p>
                Your use of YieGo is also governed by our{' '}
                <Link to="/privacy" className="text-primary hover:underline font-medium">Privacy Policy</Link>, which sets out how personal data is collected, used and stored. By continuing to use the platform, you accept that policy alongside these Terms.
              </p>
            </Section>

            <Section id="updates" number={16} title="Updates to These Terms">
              <p>
                We may revise this document whenever the platform evolves or applicable law requires it. Changes take effect as soon as the new version is published on this page, and your continued use of YieGo afterward signals acceptance of the updated terms.
              </p>
            </Section>

            <Section id="closing" number={17} title="Closing Your Account">
              <p>
                We reserve the right to suspend or close any account, with or without notice, where we find evidence of policy violations, fraudulent or suspicious transactions, abuse of platform features, or behaviour that endangers the platform or other users. Suspension may include the loss of access to wallet balances, agent earnings or order history while investigations are pending.
              </p>
            </Section>

            <Section id="law" number={18} title="Applicable Law">
              <p>
                These Terms are interpreted under the laws of the Republic of Ghana. Any dispute arising from your use of YieGo will fall under the exclusive jurisdiction of Ghanaian courts.
              </p>
            </Section>

            <Section id="contact" number={19} title="Reaching Us">
              <p>
                For any question related to these Terms — or for help with your account — please contact our team through the in-app live chat, the{' '}
                <Link to="/support" className="text-primary hover:underline font-medium">Support page</Link>, or by email at{' '}
                <a href="mailto:support@yiego.com" className="text-primary hover:underline font-medium">support@yiego.com</a>.
              </p>
            </Section>

            {/* Bottom callout */}
            <BottomCallout />
          </div>
        </div>
      </div>
    </Layout>
  );
};

const Intro = () => (
  <div className="relative rounded-2xl border border-border/70 bg-gradient-to-br from-primary/[0.06] via-card to-card p-6 overflow-hidden shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.25)]">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
    <p className="text-[13.5px] text-muted-foreground leading-relaxed">
      Welcome to <strong className="text-foreground">YieGo</strong> ("YieGo", "we", "us", "our"). The Terms below govern your access to and use of the YieGo website, mobile experience, wallet, agent program and every connected feature — referred to collectively as the <em>Service</em>.
    </p>
    <p className="text-[13.5px] text-muted-foreground leading-relaxed mt-3">
      Tapping a sign-up button, placing an order, or otherwise using the Service signals that you have read these Terms, understood them, and agreed to be bound by them. If any of the provisions below sit uncomfortably with you, please stop using the Service.
    </p>
  </div>
);

const BottomCallout = () => (
  <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/[0.06] via-card to-card p-7 mt-8 text-center shadow-[0_24px_60px_-24px_hsl(var(--primary)/0.3)]">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
    <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-40 rounded-full bg-primary/10 blur-3xl" />
    <div className="noise-overlay" />
    <div className="relative">
      <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 items-center justify-center mb-4 shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.4)]">
        <MessageCircle className="w-5 h-5 text-primary" strokeWidth={1.9} />
      </div>
      <h3 className="font-display font-extrabold text-xl tracking-[-0.02em]">
        Questions about these terms?
      </h3>
      <p className="text-[13.5px] text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
        Our team can walk you through anything that isn't clear. We aim to reply within a few hours during local business time.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
        <Link
          to="/support"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-[0_10px_28px_-10px_hsl(var(--primary)/0.6)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-10px_hsl(var(--primary)/0.7)] transition-all"
        >
          Talk to support <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <a
          href="mailto:support@yiego.com"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-border bg-background/60 backdrop-blur-sm text-sm font-medium hover:border-primary/35 hover:bg-card transition-all"
        >
          <Mail className="w-3.5 h-3.5" /> Email
        </a>
      </div>
    </div>
  </div>
);

const Section = ({ id, number, title, children }: { id: string; number: number; title: string; children: React.ReactNode }) => (
  <section
    id={id}
    className="relative scroll-mt-24 rounded-2xl border border-border/70 bg-card overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.25)]"
  >
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
    <div className="p-6 md:p-7">
      <h2 className="font-display font-extrabold text-[1.05rem] tracking-tight flex items-center gap-3 mb-4">
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 text-primary text-[11.5px] font-extrabold tabular flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.35)]">
          {String(number).padStart(2, '0')}
        </span>
        <span>{title}</span>
      </h2>
      <div className="space-y-3 text-[13.5px] text-muted-foreground leading-relaxed">{children}</div>
    </div>
  </section>
);

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="pl-3 border-l-2 border-primary/20">
    <h3 className="text-[12.5px] font-bold text-foreground/90 mb-1.5 tracking-tight">{title}</h3>
    {children}
  </div>
);

export default Terms;
