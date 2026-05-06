import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Mail, MessageCircle, ArrowRight } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

// Update these strings to change the dates site-wide
export const PRIVACY_EFFECTIVE_DATE = 'February 18, 2025';
export const PRIVACY_LAST_UPDATED = 'February 18, 2025';
export const PRIVACY_VERSION = 'v1.0';

const SECTIONS = [
  { id: 'about', title: 'About YieGo' },
  { id: 'what-we-collect', title: 'What We Collect' },
  { id: 'how-we-use', title: 'How We Use Your Data' },
  { id: 'lawful-grounds', title: 'Lawful Grounds for Processing' },
  { id: 'sharing', title: 'Sharing Data with Third Parties' },
  { id: 'agent-data', title: 'Data within the Agent Program' },
  { id: 'cookies', title: 'Cookies and Trackers' },
  { id: 'storage', title: 'Storage and Security Measures' },
  { id: 'retention', title: 'How Long Data Is Kept' },
  { id: 'rights', title: 'Your Privacy Rights' },
  { id: 'closing', title: 'Closing Your Account' },
  { id: 'external', title: 'External Links' },
  { id: 'minors', title: 'Use by Minors' },
  { id: 'updates', title: 'Updates to This Policy' },
  { id: 'contact', title: 'Get in Touch' },
];

const Privacy = () => {
  return (
    <Layout>
      <SEOHead
        title="Privacy Policy | YieGo"
        description="How YieGo collects, uses, stores and protects your personal data — across data bundle purchases, the wallet, the agent program and every other platform feature."
        path="/privacy"
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
          <Breadcrumbs items={[{ label: 'Privacy Policy' }]} />

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors mt-2 mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>

          <div className="flex items-start gap-5">
            <div className="relative shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 flex items-center justify-center shadow-[0_12px_28px_-10px_hsl(var(--primary)/0.45),inset_0_1px_0_0_hsl(var(--primary)/0.3)]">
              <Shield className="w-6 h-6 text-primary" strokeWidth={1.9} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Privacy</span>
              </div>
              <h1 className="text-3xl md:text-[2.6rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
                Privacy <span className="text-gradient">Policy</span>
              </h1>
              <p className="text-muted-foreground text-[14px] mt-3 max-w-2xl leading-relaxed">
                A clear summary of the personal data YieGo collects, why it is collected, who it is shared with, and the controls you have over it. We never sell your information.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[10.5px] font-medium text-muted-foreground">
                  Effective <span className="font-bold text-foreground tabular">{PRIVACY_EFFECTIVE_DATE}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[10.5px] font-medium text-muted-foreground">
                  Last updated <span className="font-bold text-foreground tabular">{PRIVACY_LAST_UPDATED}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-[10.5px] font-bold tabular text-primary uppercase tracking-wide">
                  {PRIVACY_VERSION}
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

            <Section id="about" number={1} title="About YieGo">
              <p>
                YieGo is an online platform that helps Ghanaians manage everyday digital purchases — starting with mobile data bundles for the country's major telecom networks. The platform also includes a stored-balance wallet, an agent program for resellers, and a growing scope of digital services.
              </p>
              <p>
                This policy explains how we handle the personal data of everyone who uses the platform — customers, registered account-holders and agents alike.
              </p>
            </Section>

            <Section id="what-we-collect" number={2} title="What We Collect">
              <SubSection title="2.1 Identifying details">
                <p>
                  Information that identifies you directly — your full legal name, email address, phone number, your chosen username and the encrypted form of your password.
                </p>
              </SubSection>
              <SubSection title="2.2 Transaction records">
                <p>
                  Records tied to each purchase — the recipient's number, the chosen network and bundle, the amount paid, the partner-side reference IDs, the lifecycle status of the order, and the timestamps of key events.
                </p>
              </SubSection>
              <SubSection title="2.3 Agent details">
                <p>
                  If you join the Agent program, we additionally hold your storefront name, the assigned store link, sales-performance metrics, application details, and confirmation of any subscription payments tied to your agent status.
                </p>
              </SubSection>
              <SubSection title="2.4 Device and usage signals">
                <p>
                  Technical signals collected automatically — IP address, browser identifier and version, device type and operating system, pages viewed and time spent on each, login activity, and the approximate location derived from your IP.
                </p>
              </SubSection>
              <SubSection title="2.5 Support interactions">
                <p>
                  Anything you share with our support team — message threads, attachments, payment screenshots, ticket histories — together with the internal logs of those conversations for quality and security purposes.
                </p>
              </SubSection>
            </Section>

            <Section id="how-we-use" number={3} title="How We Use Your Data">
              <SubSection title="3.1 Running the service">
                <p>
                  To set up and operate your account, route bundle orders through to the right network, verify payments, surface your order history with current statuses, and keep agent storefronts and order flows working.
                </p>
              </SubSection>
              <SubSection title="3.2 Improving the platform">
                <p>
                  To monitor how the platform is performing, identify and patch bugs, and improve the experience and reliability of every step from checkout to delivery.
                </p>
              </SubSection>
              <SubSection title="3.3 Communicating with you">
                <p>
                  To send order confirmations and lifecycle updates, reply to your support requests, share important service announcements, and notify Agents about programme changes.
                </p>
              </SubSection>
              <SubSection title="3.4 Security and fraud prevention">
                <p>
                  To spot suspicious behaviour, block unauthorised access attempts, protect both individual accounts and the platform as a whole, and enforce our Terms of Service.
                </p>
              </SubSection>
              <SubSection title="3.5 Legal and compliance">
                <p>
                  To retain transaction records for accounting and audit, and to respond to lawful requests from regulators or law-enforcement bodies where the law requires us to do so.
                </p>
              </SubSection>
            </Section>

            <Section id="lawful-grounds" number={4} title="Lawful Grounds for Processing">
              <p>We rely on the following legal bases when processing your personal data:</p>
              <ul className="list-disc pl-5 space-y-1.5 marker:text-primary/60">
                <li><strong className="text-foreground/90">Contract performance</strong> — we have to process certain data to deliver bundles you have paid for.</li>
                <li><strong className="text-foreground/90">Consent</strong> — for data you voluntarily provide outside the contract.</li>
                <li><strong className="text-foreground/90">Legitimate interests</strong> — fraud prevention, security and continuous improvement.</li>
                <li><strong className="text-foreground/90">Legal obligation</strong> — when Ghanaian law or its regulators require it.</li>
              </ul>
            </Section>

            <Section id="sharing" number={5} title="Sharing Data with Third Parties">
              <p className="font-semibold text-foreground/90">We do not sell, rent or trade personal information to anyone.</p>
              <p>
                That said, operating the platform requires sharing limited data with trusted partners. We pass on only what is strictly necessary for each partner to perform its role.
              </p>
              <SubSection title="5.1 Payment partners">
                <p>
                  To collect payment, transaction details may be passed to our payment partner and the underlying Mobile Money operators. These partners are bound by their own contractual and regulatory obligations regarding the data they receive.
                </p>
              </SubSection>
              <SubSection title="5.2 Telecom delivery partners">
                <p>
                  To complete delivery, we forward the minimum necessary information — the recipient's number, the chosen network, and the requested bundle — to the telecom operator or its authorised distributor.
                </p>
              </SubSection>
              <SubSection title="5.3 Service providers">
                <p>
                  Operating the platform requires a network of service providers, including cloud hosting, analytics tools, database and infrastructure vendors, and email or push-notification systems. They process only what they need to perform their function.
                </p>
              </SubSection>
              <SubSection title="5.4 Lawful disclosures">
                <p>
                  Where compelled by a court order, regulatory authority, or another lawful instruction, we may disclose information necessary to comply, defend our rights, or investigate fraud and security incidents.
                </p>
              </SubSection>
            </Section>

            <Section id="agent-data" number={6} title="Data within the Agent Program">
              <p>
                When a customer purchases through an Agent's storefront, the Agent is shown a limited view of that order — the amount paid, the order status, the bundle and network selected, and the timestamp.
              </p>
              <p>
                Agents do <strong className="text-foreground/90">not</strong> receive sensitive payment credentials such as Mobile Money PINs, card numbers, or authorisation tokens, all of which remain inside the upstream payment system. YieGo continues to maintain the complete authoritative record of every transaction for support and audit purposes.
              </p>
            </Section>

            <Section id="cookies" number={7} title="Cookies and Trackers">
              <p>
                YieGo uses cookies and similar tracking technologies to keep your session active, optimise site performance, remember your preferences, deter fraud, and study aggregate usage patterns so we can improve the experience.
              </p>
              <p>
                Browsers let you disable or restrict cookies; some platform features will not work as expected if you do.
              </p>
            </Section>

            <Section id="storage" number={8} title="Storage and Security Measures">
              <p>
                We apply industry-standard safeguards to protect your information — password hashing, secure payment processing flows, network firewalls and server hardening, strict internal access controls, and continuous monitoring for unusual activity.
              </p>
              <p>
                No connected system can be made fully invulnerable, however, so by using YieGo you acknowledge that some residual risk is inherent to any online service.
              </p>
            </Section>

            <Section id="retention" number={9} title="How Long Data Is Kept">
              <p>
                Personal and transactional data is kept for as long as it is needed to keep the platform running for you, support audit and dispute resolution, comply with legal duties, and prevent fraud or abuse.
              </p>
              <p>
                Some transaction records may be retained even after you close your account where retention is required for compliance or accounting.
              </p>
            </Section>

            <Section id="rights" number={10} title="Your Privacy Rights">
              <p>Subject to applicable law, you have the right to:</p>
              <ul className="list-disc pl-5 space-y-1.5 marker:text-primary/60">
                <li>Request access to the personal data we hold about you.</li>
                <li>Ask us to correct any inaccurate information.</li>
                <li>Request the deletion of your account, subject to lawful retention requirements.</li>
                <li>Limit how we process your data in certain circumstances.</li>
                <li>Object to specific kinds of processing.</li>
                <li>Withdraw any consent you previously gave us.</li>
              </ul>
              <p>You can exercise any of these rights through the contact channels listed below.</p>
            </Section>

            <Section id="closing" number={11} title="Closing Your Account">
              <p>
                If you decide to close your YieGo account, please contact support. Once your request is processed, your profile is removed from our active systems, but historical transaction records may continue to be held for compliance, fraud prevention and accounting purposes.
              </p>
            </Section>

            <Section id="external" number={12} title="External Links">
              <p>
                Some pages on YieGo may link out to websites or platforms operated by other companies. Their privacy practices and content are not under our control, and this policy does not extend to them.
              </p>
            </Section>

            <Section id="minors" number={13} title="Use by Minors">
              <p>
                YieGo is built for users 18 years of age or older. We do not knowingly collect personal data from minors. If we discover that a minor has submitted information to the platform, we will remove it as soon as we become aware.
              </p>
            </Section>

            <Section id="updates" number={14} title="Updates to This Policy">
              <p>
                We may update this Privacy Policy as the platform evolves or applicable law changes. The latest version is always shown on this page, and the "Last Updated" badge will reflect the most recent revision. By continuing to use YieGo after an update, you accept the revised policy.
              </p>
            </Section>

            <Section id="contact" number={15} title="Get in Touch">
              <p>
                Questions about this policy or the way your data is handled can be sent to us through the in-app live chat, our{' '}
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
      <strong className="text-foreground">YieGo</strong> ("we", "our", "us") respects your privacy and treats the protection of personal data as a core platform commitment. This Privacy Policy explains what information we gather about you, how we use it, who we share it with, and the rights you can exercise — across the website, the wallet, the agent program and every other YieGo service.
    </p>
    <p className="text-[13.5px] text-muted-foreground leading-relaxed mt-3">
      By accessing or using YieGo, you accept that your information will be processed in line with this policy.
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
        Concerns about your data?
      </h3>
      <p className="text-[13.5px] text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
        Reach out and we will walk you through anything that's unclear, or action a privacy request on your behalf.
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

export default Privacy;
