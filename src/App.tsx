import { Suspense, lazy, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isStoreHost, setHostSlug } from "@/lib/storeHost";
import { useStore } from "@/components/store/StoreShell";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { ThemeProvider, useTheme } from "@/store/theme";
import { AuthProvider } from "@/store/auth";
import { WalletProvider } from "@/store/wallet";
import { ProfileProvider } from "@/store/profile";
import { FlowsProvider } from "@/store/flows";
import AppPage from "@/components/layout/AppPage";
import PublicShell from "@/components/layout/PublicShell";
import StoreMissing from "@/components/store/StoreMissing";
import Home from "./pages/Home";
// Tiny route guards — kept eager so gated pages don't wait on an extra chunk.
import RequireAdmin from "@/components/auth/RequireAdmin";
import RequireAuth from "@/components/auth/RequireAuth";

/* Only the public homepage ships in the entry bundle. Every other route —
   the app, the admin suite, the informational pages — is fetched on demand,
   so a first-time visitor downloads a fraction of the code. */
const About = lazy(() => import("./pages/About"));
const Prices = lazy(() => import("./pages/Prices"));
const NetworkBundles = lazy(() => import("./pages/NetworkBundles"));
const CheapData = lazy(() => import("./pages/CheapData"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Faq = lazy(() => import("./pages/Faq"));
const Contact = lazy(() => import("./pages/Contact"));
const Support = lazy(() => import("./pages/Support"));
const LegalDocument = lazy(() => import("./pages/LegalDocument"));
const Shop = lazy(() => import("./pages/Shop"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Orders = lazy(() => import("./pages/Orders"));
const Account = lazy(() => import("./pages/Account"));
const AISupport = lazy(() => import("./pages/AISupport"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const TrackOrder = lazy(() => import("./pages/TrackOrder"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const AdminShell = lazy(() => import("@/components/admin/AdminShell"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const AdminReviews = lazy(() => import("./pages/AdminReviews"));
const AdminDisputes = lazy(() => import("./pages/AdminDisputes"));
const AdminSuppliers = lazy(() => import("./pages/AdminSuppliers"));
const AdminDomains = lazy(() => import("./pages/AdminDomains"));
const AdminWallet = lazy(() => import("./pages/AdminWallet"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminPricing = lazy(() => import("./pages/AdminPricing"));
const AdminAISupport = lazy(() => import("./pages/AdminAISupport"));
const AdminAIKnowledge = lazy(() => import("./pages/AdminAIKnowledge"));
const AdminSupportInbox = lazy(() => import("./pages/AdminSupportInbox"));
const AdminAgentAssistant = lazy(() => import("./pages/AdminAgentAssistant"));
const AdminStorefrontChats = lazy(() => import("./pages/AdminStorefrontChats"));
const AdminContact = lazy(() => import("./pages/AdminContact"));
const AdminLegal = lazy(() => import("./pages/AdminLegal"));
const AdminFinance = lazy(() => import("./pages/AdminFinance"));
const AdminFunding = lazy(() => import("./pages/AdminFunding"));
const AdminExpenses = lazy(() => import("./pages/AdminExpenses"));
const Invite = lazy(() => import("./pages/Invite"));
const CheckMtn = lazy(() => import("./pages/CheckMtn"));
const Giveaway = lazy(() => import("./pages/Giveaway"));
const AgentCheckMtn = lazy(() => import("./pages/agent/AgentCheckMtn"));
const AdminSubmittedNumbers = lazy(() => import("./pages/AdminSubmittedNumbers"));
const AdminStatus = lazy(() => import("./pages/AdminStatus"));
const AdminSms = lazy(() => import("./pages/AdminSms"));
const AdminMtnVerification = lazy(() => import("./pages/AdminMtnVerification"));
const AdminMtnVerificationSent = lazy(() => import("./pages/AdminMtnVerificationSent"));
const AdminMtnVerificationHistory = lazy(() => import("./pages/AdminMtnVerificationHistory"));
const AdminSmsMessages = lazy(() => import("./pages/AdminSmsMessages"));
const AdminSmsTemplates = lazy(() => import("./pages/AdminSmsTemplates"));
const AdminSmsSettings = lazy(() => import("./pages/AdminSmsSettings"));
const AdminReferrals = lazy(() => import("./pages/AdminReferrals"));
const AdminUndelivered = lazy(() => import("./pages/AdminUndelivered"));
const AdminMasterBalance = lazy(() => import("./pages/AdminMasterBalance"));
const AdminAgents = lazy(() => import("./pages/AdminAgents"));
const AdminOrdersReceived = lazy(() => import("./pages/AdminOrdersReceived"));
const AdminAnnouncements = lazy(() => import("./pages/AdminAnnouncements"));
const AdminGiveaways = lazy(() => import("./pages/AdminGiveaways"));
const AdminPromotions = lazy(() => import("./pages/AdminPromotions"));
const Promotion = lazy(() => import("./pages/Promotion"));
const AdminSupplierBalance = lazy(() => import("./pages/AdminSupplierBalance"));
const AdminAgentDetail = lazy(() => import("./pages/AdminAgentDetail"));
const AdminSubAgents = lazy(() => import("./pages/AdminSubAgents"));
const AgentsApply = lazy(() => import("./pages/AgentsApply"));
const AgentsStore = lazy(() => import("./pages/AgentsStore"));
const AgentAsk = lazy(() => import("./pages/agent/AgentAsk"));
const StoreShell = lazy(() => import("./components/store/StoreShell"));
const StoreHome = lazy(() => import("./pages/store/StoreHome"));
const StudioHome = lazy(() => import("./pages/store/StudioHome"));
const MarketHome = lazy(() => import("./pages/store/MarketHome"));
const ClassicHome = lazy(() => import("./pages/store/ClassicHome"));
const StoreIndex = () => { const st = useStore(); return st.template === "studio" ? <StudioHome /> : st.template === "market" ? <MarketHome /> : <ClassicHome />; };
const StoreOrder = lazy(() => import("./pages/store/StoreOrder"));
const StoreAbout = lazy(() => import("./pages/store/StoreAbout"));
const StoreContact = lazy(() => import("./pages/store/StoreContact"));
const StoreFaq = lazy(() => import("./pages/store/StoreFaq"));
const StoreCheckMtn = lazy(() => import("./pages/store/StoreCheckMtn"));
const StoreAuth = lazy(() => import("./pages/store/StoreAuth"));
const StoreAccount = lazy(() => import("./pages/store/StoreAccount"));
const StoreJoin = lazy(() => import("./pages/store/StoreJoin"));
const StorePrices = lazy(() => import("./pages/store/StorePrices"));
const AgentNetwork = lazy(() => import("./pages/agent/AgentNetwork"));
const AgentNetworkPrices = lazy(() => import("./pages/agent/AgentNetworkPrices"));
const AgentPopups = lazy(() => import("./pages/agent/AgentPopups"));
const AgentStatus = lazy(() => import("./pages/agent/AgentStatus"));
const AgentCustomers = lazy(() => import("./pages/agent/AgentCustomers"));
const AgentMarketing = lazy(() => import("./pages/agent/AgentMarketing"));
const AgentAnalytics = lazy(() => import("./pages/agent/AgentAnalytics"));
const AgentSupport = lazy(() => import("./pages/agent/AgentSupport"));
const AgentAssistant = lazy(() => import("./pages/agent/AgentAssistant"));
const AgentTeam = lazy(() => import("./pages/agent/AgentTeam"));
const AgentDomain = lazy(() => import("./pages/agent/AgentDomain"));
const AgentShell = lazy(() => import("./components/agent/AgentShell"));
const AgentHome = lazy(() => import("./pages/agent/AgentHome"));
const AgentBuy = lazy(() => import("./pages/agent/AgentBuy"));
const AgentHelp = lazy(() => import("./pages/agent/AgentHelp"));
const AgentsHelp = lazy(() => import("./pages/AgentsHelp"));
const AdminHelp = lazy(() => import("./pages/AdminHelp"));
const AgentOrdersPage = lazy(() => import("./pages/agent/AgentOrders"));
const AgentPrices = lazy(() => import("./pages/agent/AgentPrices"));
const AgentEarnings = lazy(() => import("./pages/agent/AgentEarnings"));
const AgentStoreSettings = lazy(() => import("./pages/agent/AgentStoreSettings"));

function ThemedToaster() { const { resolved } = useTheme(); return <Toaster position="top-center" theme={resolved} toastOptions={{ classNames: { toast: "!rounded-2xl !border !border-white/10 !bg-[var(--toast-bg)] !text-[var(--toast-ink)] !shadow-[var(--toast-shadow)]", title: "!text-[13.5px] !font-semibold !tracking-tight", description: "!text-[12.5px] !text-ink-dim" } }} />; }
/** Shown while a route chunk downloads. */
function RouteFallback() { return <div className="onyx-canvas grid min-h-dvh place-items-center"><Loader2 className="animate-spin text-primary-glow" size={24} /></div>; }

/* Public pages render immediately — RequireAuth/RequireAdmin show their own
   loaders while the session resolves, so nothing waits on auth to paint.
   That first-paint speed is also what crawlers measure. */
const STORE_ROUTES = <><Route index element={<StoreIndex />} /><Route path="bundles" element={<StoreHome />} /><Route path="about" element={<StoreAbout />} /><Route path="contact" element={<StoreContact />} /><Route path="faq" element={<StoreFaq />} /><Route path="check-mtn" element={<StoreCheckMtn />} /><Route path="sign-in" element={<StoreAuth mode="sign-in" />} /><Route path="sign-up" element={<StoreAuth mode="sign-up" />} /><Route path="account" element={<StoreAccount />} /><Route path="join" element={<StoreJoin />} /><Route path="prices" element={<StorePrices />} /><Route path="track" element={<StoreOrder />} /><Route path="success" element={<StoreOrder />} /></>;

/* The agent dashboard: on the main site, and on every store host so a sub-agent can stay on the parent's address. */
const AGENT_ROUTES = <><Route index element={<AgentHome />} /><Route path="buy" element={<AgentBuy />} /><Route path="help" element={<AgentHelp />} /><Route path="check-mtn" element={<AgentCheckMtn />} /><Route path="customers" element={<AgentCustomers />} /><Route path="marketing" element={<AgentMarketing />} /><Route path="analytics" element={<AgentAnalytics />} /><Route path="support" element={<AgentSupport />} /><Route path="team" element={<AgentTeam />} /><Route path="domain" element={<AgentDomain />} /><Route path="network" element={<AgentNetwork />} /><Route path="network/prices" element={<AgentNetworkPrices />} /><Route path="popups" element={<AgentPopups />} /><Route path="status" element={<AgentStatus />} /><Route path="orders" element={<AgentOrdersPage />} /><Route path="prices" element={<AgentPrices />} /><Route path="earnings" element={<AgentEarnings />} /><Route path="store" element={<AgentStoreSettings />} /><Route path="store/:view" element={<AgentStoreSettings />} /><Route path="domain/:view" element={<AgentDomain />} /><Route path="marketing/:view" element={<AgentMarketing />} /><Route path="popups/:view" element={<AgentPopups />} /><Route path="network/:view" element={<AgentNetwork />} /><Route path="team/:view" element={<AgentTeam />} /><Route path="assistant" element={<AgentAssistant />} /><Route path="ask" element={<AgentAsk />} /></>;

/* A connected custom domain or slug.datayego.com: that store lives at the root. */
const StoreHostApp = ({ slug }: { slug: string }) => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ThemeProvider><AuthProvider><WalletProvider><ProfileProvider><FlowsProvider><ThemedToaster /><Suspense fallback={<RouteFallback />}><Routes>
    <Route path="/" element={<StoreShell hostSlug={slug} />}>{STORE_ROUTES}</Route>
    <Route path="/s/:slug" element={<StoreShell />}>{STORE_ROUTES}</Route>
    <Route path="/agent" element={<AgentShell />}>{AGENT_ROUTES}</Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense></FlowsProvider></ProfileProvider></WalletProvider></AuthProvider></ThemeProvider></BrowserRouter>
);
const StoreHostGate = () => {
  // undefined: looking up; null: no store at this address; "error": the lookup itself failed (network, outage).
  const [slug, setSlug] = useState<string | null | "error" | undefined>(undefined);
  useEffect(() => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; setSlug("error"); } }, 15000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("store_by_host", { p_host: window.location.hostname })
      .then((r: { data: { slug: string } | null; error: unknown }) => { if (done) return; done = true; clearTimeout(timer); setSlug(r.error ? "error" : r.data?.slug ?? null); })
      .catch(() => { if (done) return; done = true; clearTimeout(timer); setSlug("error"); });
    return () => { done = true; clearTimeout(timer); };
  }, []);
  if (slug === undefined) return <div className="min-h-dvh bg-[#0b1512]" />;
  if (slug === null) return <StoreMissing kind="no-store-at-address" />;
  if (slug === "error") return <StoreMissing kind="could-not-load" />;
  setHostSlug(slug);
  return <StoreHostApp slug={slug} />;
};

/* The main site's whole tree, without a router: BrowserRouter on the client, StaticRouter when the public pages are
   pre-rendered at build time (src/entry-server.tsx). Keep the two in step by only ever editing this. */
export const MainSite = () => (
  <><ThemeProvider><AuthProvider><WalletProvider><ProfileProvider><FlowsProvider><ThemedToaster /><Suspense fallback={<RouteFallback />}><Routes>
    {/* Focused, chrome-free task pages. */}
    <Route path="/auth" element={<Auth />} /><Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/admin/promotions" element={<RequireAdmin><AdminShell /></RequireAdmin>}><Route index element={<AdminPromotions />} /></Route>
    <Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}><Route index element={<Admin />} /><Route path="orders" element={<AdminOrders />} /><Route path="disputes" element={<AdminDisputes />} /><Route path="reviews" element={<AdminReviews />} /><Route path="sales/pricing" element={<AdminPricing />} /><Route path="suppliers" element={<AdminSuppliers />} /><Route path="domains" element={<AdminDomains />} /><Route path="wallet" element={<AdminWallet />} /><Route path="finance" element={<AdminFinance />} /><Route path="finance/funding" element={<AdminFunding />} /><Route path="finance/expenses" element={<AdminExpenses />} /><Route path="finance/undelivered" element={<AdminUndelivered />} /><Route path="finance/master" element={<AdminMasterBalance />} /><Route path="agents" element={<AdminAgents />} /><Route path="agents/applications" element={<AdminAgents />} /><Route path="agents/list" element={<AdminAgents />} /><Route path="agents/subscriptions" element={<AdminAgents />} /><Route path="agents/payouts" element={<AdminAgents />} /><Route path="referrals" element={<AdminReferrals />} /><Route path="orders/submitted-numbers" element={<AdminSubmittedNumbers />} /><Route path="status" element={<AdminStatus />} /><Route path="mtn-verification" element={<AdminMtnVerification />} /><Route path="mtn-verification/sent" element={<AdminMtnVerificationSent />} /><Route path="mtn-verification/history" element={<AdminMtnVerificationHistory />} /><Route path="sms" element={<AdminSms />} /><Route path="sms/messages" element={<AdminSmsMessages />} /><Route path="sms/templates" element={<AdminSmsTemplates />} /><Route path="sms/settings" element={<AdminSmsSettings />} /><Route path="agents/plan" element={<AdminAgents />} /><Route path="agents/launch" element={<AdminAgents />} /><Route path="agents/:id" element={<AdminAgentDetail />} /><Route path="sub-agents" element={<AdminSubAgents />} /><Route path="sub-agents/parents" element={<AdminSubAgents />} /><Route path="sub-agents/list" element={<AdminSubAgents />} /><Route path="sub-agents/applications" element={<AdminSubAgents />} /><Route path="sub-agents/settings" element={<AdminSubAgents />} /><Route path="orders/received" element={<AdminOrdersReceived />} /><Route path="announcements" element={<AdminAnnouncements />} /><Route path="giveaways" element={<AdminGiveaways />} /><Route path="help" element={<AdminHelp />} /><Route path="finance/suppliers/:code" element={<AdminSupplierBalance />} /><Route path="finance/master" element={<AdminMasterBalance />} /><Route path="agents" element={<AdminAgents />} /><Route path="agents/applications" element={<AdminAgents />} /><Route path="agents/list" element={<AdminAgents />} /><Route path="agents/subscriptions" element={<AdminAgents />} /><Route path="agents/payouts" element={<AdminAgents />} /><Route path="agents/plan" element={<AdminAgents />} /><Route path="agents/launch" element={<AdminAgents />} /><Route path="agents/:id" element={<AdminAgentDetail />} /><Route path="orders/received" element={<AdminOrdersReceived />} /><Route path="announcements" element={<AdminAnnouncements />} /><Route path="giveaways" element={<AdminGiveaways />} /><Route path="finance/suppliers/:code" element={<AdminSupplierBalance />} /><Route path="users" element={<AdminUsers />} /><Route path="contacts/information" element={<AdminContact />} /><Route path="legal" element={<AdminLegal />} /><Route path="ai-support" element={<AdminAISupport />} /><Route path="ai-knowledge" element={<AdminAIKnowledge />} /><Route path="support-inbox" element={<AdminSupportInbox />} /><Route path="agent-assistant" element={<AdminAgentAssistant />} /><Route path="storefront-chats" element={<AdminStorefrontChats />} /></Route>
    {/* One shell for the whole site: the same header and footer wrap the
        marketing pages, the shop and the account area. */}
        <Route path="/s/:slug" element={<StoreShell />}>{STORE_ROUTES}</Route>
    <Route path="/agent" element={<AgentShell />}>{AGENT_ROUTES}</Route>
    <Route element={<PublicShell />}>
      {/* Marketing pages lay out their own full-bleed sections. */}
      <Route path="/" element={<Home />} /><Route path="/agents" element={<AgentsApply />} /><Route path="/agents/store" element={<AgentsStore />} />
      <Route path="/about" element={<About />} />
      {/* SEO landing pages: live prices per network + the comparison page. */}
      <Route path="/prices" element={<Prices />} />
      <Route path="/mtn-data-bundles" element={<NetworkBundles network="mtn" />} />
      <Route path="/telecel-data-bundles" element={<NetworkBundles network="telecel" />} />
      <Route path="/airteltigo-data-bundles" element={<NetworkBundles network="at" />} />
      <Route path="/cheap-data-bundles-ghana" element={<CheapData />} />
      {/* Guides — the informational searches the media blogs currently own. */}
      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/support" element={<Support />} /><Route path="/help/agents" element={<AgentsHelp />} />
      <Route path="/legal/:slug" element={<LegalDocument />} />
      {/* App pages render inside the standard content column. */}
      <Route element={<AppPage />}>
        <Route path="/shop" element={<Shop />} />
        <Route path="/promo" element={<Promotion />} />
        <Route path="/track-order" element={<TrackOrder />} /><Route path="/r/:code" element={<Invite />} /><Route path="/g/:slug" element={<Giveaway />} /><Route path="/giveaway" element={<Giveaway />} /><Route path="/check-mtn" element={<CheckMtn />} /><Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/support/ai" element={<AISupport />} />
        <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
        <Route path="/wallet" element={<RequireAuth><Wallet /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
      </Route>
      {/* A real 404 (noindexed) instead of a soft-404 redirect home. */}
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes></Suspense></FlowsProvider></ProfileProvider></WalletProvider></AuthProvider></ThemeProvider></>
);

/* v7_startTransition: while the next page's code downloads, keep showing the current page instead of swapping to a
   full-screen loader and back — that swap is the "wrong screen for a split second" flash. */
const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const App = () => isStoreHost() ? <StoreHostGate /> : <BrowserRouter future={ROUTER_FUTURE}><MainSite /></BrowserRouter>;
export default App;
