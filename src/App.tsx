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
const AdminContact = lazy(() => import("./pages/AdminContact"));
const AdminLegal = lazy(() => import("./pages/AdminLegal"));
const AdminFinance = lazy(() => import("./pages/AdminFinance"));
const AdminFunding = lazy(() => import("./pages/AdminFunding"));
const Invite = lazy(() => import("./pages/Invite"));
const CheckMtn = lazy(() => import("./pages/CheckMtn"));
const Giveaway = lazy(() => import("./pages/Giveaway"));
const AgentCheckMtn = lazy(() => import("./pages/agent/AgentCheckMtn"));
const AdminSubmittedNumbers = lazy(() => import("./pages/AdminSubmittedNumbers"));
const AdminStatus = lazy(() => import("./pages/AdminStatus"));
const AdminReferrals = lazy(() => import("./pages/AdminReferrals"));
const AdminUndelivered = lazy(() => import("./pages/AdminUndelivered"));
const AdminMasterBalance = lazy(() => import("./pages/AdminMasterBalance"));
const AdminAgents = lazy(() => import("./pages/AdminAgents"));
const AdminOrdersReceived = lazy(() => import("./pages/AdminOrdersReceived"));
const AdminAnnouncements = lazy(() => import("./pages/AdminAnnouncements"));
const AdminGiveaways = lazy(() => import("./pages/AdminGiveaways"));
const AdminSupplierBalance = lazy(() => import("./pages/AdminSupplierBalance"));
const AdminAgentDetail = lazy(() => import("./pages/AdminAgentDetail"));
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
const AgentNetwork = lazy(() => import("./pages/agent/AgentNetwork"));
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
const STORE_ROUTES = <><Route index element={<StoreIndex />} /><Route path="bundles" element={<StoreHome />} /><Route path="about" element={<StoreAbout />} /><Route path="contact" element={<StoreContact />} /><Route path="faq" element={<StoreFaq />} /><Route path="check-mtn" element={<StoreCheckMtn />} /><Route path="sign-in" element={<StoreAuth mode="sign-in" />} /><Route path="sign-up" element={<StoreAuth mode="sign-up" />} /><Route path="account" element={<StoreAccount />} /><Route path="join" element={<StoreJoin />} /><Route path="track" element={<StoreOrder />} /><Route path="success" element={<StoreOrder />} /></>;

/* A connected custom domain or slug.datayego.com: that store lives at the root. */
const StoreHostApp = ({ slug }: { slug: string }) => (
  <BrowserRouter><ThemeProvider><AuthProvider><WalletProvider><ProfileProvider><FlowsProvider><ThemedToaster /><Suspense fallback={<RouteFallback />}><Routes>
    <Route path="/" element={<StoreShell hostSlug={slug} />}>{STORE_ROUTES}</Route>
    <Route path="/s/:slug" element={<StoreShell />}>{STORE_ROUTES}</Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense></FlowsProvider></ProfileProvider></WalletProvider></AuthProvider></ThemeProvider></BrowserRouter>
);
const StoreHostGate = () => {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("store_by_host", { p_host: window.location.hostname }).then((r: { data: { slug: string } | null }) => setSlug(r.data?.slug ?? null));
  }, []);
  if (slug === undefined) return <div className="min-h-dvh bg-[#0b1512]" />;
  if (slug) setHostSlug(slug);
  if (slug === null) return <div className="flex min-h-dvh items-center justify-center bg-[#0b1512] px-6 text-center text-[14px] text-white/70">This address isn't connected to a store yet.</div>;
  return <StoreHostApp slug={slug} />;
};

const App = () => isStoreHost() ? <StoreHostGate /> : (
  <BrowserRouter><ThemeProvider><AuthProvider><WalletProvider><ProfileProvider><FlowsProvider><ThemedToaster /><Suspense fallback={<RouteFallback />}><Routes>
    {/* Focused, chrome-free task pages. */}
    <Route path="/auth" element={<Auth />} /><Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}><Route index element={<Admin />} /><Route path="orders" element={<AdminOrders />} /><Route path="disputes" element={<AdminDisputes />} /><Route path="reviews" element={<AdminReviews />} /><Route path="sales/pricing" element={<AdminPricing />} /><Route path="suppliers" element={<AdminSuppliers />} /><Route path="domains" element={<AdminDomains />} /><Route path="wallet" element={<AdminWallet />} /><Route path="finance" element={<AdminFinance />} /><Route path="finance/funding" element={<AdminFunding />} /><Route path="finance/undelivered" element={<AdminUndelivered />} /><Route path="finance/master" element={<AdminMasterBalance />} /><Route path="agents" element={<AdminAgents />} /><Route path="agents/applications" element={<AdminAgents />} /><Route path="agents/list" element={<AdminAgents />} /><Route path="agents/subscriptions" element={<AdminAgents />} /><Route path="agents/payouts" element={<AdminAgents />} /><Route path="referrals" element={<AdminReferrals />} /><Route path="orders/submitted-numbers" element={<AdminSubmittedNumbers />} /><Route path="status" element={<AdminStatus />} /><Route path="agents/plan" element={<AdminAgents />} /><Route path="agents/launch" element={<AdminAgents />} /><Route path="agents/:id" element={<AdminAgentDetail />} /><Route path="orders/received" element={<AdminOrdersReceived />} /><Route path="announcements" element={<AdminAnnouncements />} /><Route path="giveaways" element={<AdminGiveaways />} /><Route path="help" element={<AdminHelp />} /><Route path="finance/suppliers/:code" element={<AdminSupplierBalance />} /><Route path="finance/master" element={<AdminMasterBalance />} /><Route path="agents" element={<AdminAgents />} /><Route path="agents/applications" element={<AdminAgents />} /><Route path="agents/list" element={<AdminAgents />} /><Route path="agents/subscriptions" element={<AdminAgents />} /><Route path="agents/payouts" element={<AdminAgents />} /><Route path="agents/plan" element={<AdminAgents />} /><Route path="agents/launch" element={<AdminAgents />} /><Route path="agents/:id" element={<AdminAgentDetail />} /><Route path="orders/received" element={<AdminOrdersReceived />} /><Route path="announcements" element={<AdminAnnouncements />} /><Route path="giveaways" element={<AdminGiveaways />} /><Route path="finance/suppliers/:code" element={<AdminSupplierBalance />} /><Route path="users" element={<AdminUsers />} /><Route path="contacts/information" element={<AdminContact />} /><Route path="legal" element={<AdminLegal />} /><Route path="ai-support" element={<AdminAISupport />} /><Route path="ai-knowledge" element={<AdminAIKnowledge />} /><Route path="support-inbox" element={<AdminSupportInbox />} /><Route path="agent-assistant" element={<AdminAgentAssistant />} /></Route>
    {/* One shell for the whole site: the same header and footer wrap the
        marketing pages, the shop and the account area. */}
        <Route path="/s/:slug" element={<StoreShell />}>{STORE_ROUTES}</Route>
    <Route path="/agent" element={<AgentShell />}><Route index element={<AgentHome />} /><Route path="buy" element={<AgentBuy />} /><Route path="help" element={<AgentHelp />} /><Route path="check-mtn" element={<AgentCheckMtn />} /><Route path="customers" element={<AgentCustomers />} /><Route path="marketing" element={<AgentMarketing />} /><Route path="analytics" element={<AgentAnalytics />} /><Route path="support" element={<AgentSupport />} /><Route path="team" element={<AgentTeam />} /><Route path="domain" element={<AgentDomain />} /><Route path="network" element={<AgentNetwork />} /><Route path="popups" element={<AgentPopups />} /><Route path="status" element={<AgentStatus />} /><Route path="orders" element={<AgentOrdersPage />} /><Route path="prices" element={<AgentPrices />} /><Route path="earnings" element={<AgentEarnings />} /><Route path="store" element={<AgentStoreSettings />} /><Route path="store/:view" element={<AgentStoreSettings />} /><Route path="domain/:view" element={<AgentDomain />} /><Route path="marketing/:view" element={<AgentMarketing />} /><Route path="popups/:view" element={<AgentPopups />} /><Route path="network/:view" element={<AgentNetwork />} /><Route path="team/:view" element={<AgentTeam />} /><Route path="assistant" element={<AgentAssistant />} /><Route path="ask" element={<AgentAsk />} /></Route>
    <Route element={<PublicShell />}>
      {/* Marketing pages lay out their own full-bleed sections. */}
      <Route path="/" element={<Home />} /><Route path="/agents" element={<AgentsApply />} /><Route path="/agents/store" element={<AgentsStore />} />
      <Route path="/about" element={<About />} />
      {/* SEO landing pages: live prices per network + the comparison page. */}
      <Route path="/prices" element={<Prices />} />
      <Route path="/mtn-data-bundles" element={<NetworkBundles network="mtn" />} />
      <Route path="/telecel-data-bundles" element={<NetworkBundles network="telecel" />} />
      <Route path="/airteltigo-data-bundles" element={<NetworkBundles network="at" />} />
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
        <Route path="/track-order" element={<TrackOrder />} /><Route path="/r/:code" element={<Invite />} /><Route path="/g/:slug" element={<Giveaway />} /><Route path="/giveaway" element={<Giveaway />} /><Route path="/check-mtn" element={<CheckMtn />} /><Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/support/ai" element={<AISupport />} />
        <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
        <Route path="/wallet" element={<RequireAuth><Wallet /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
      </Route>
      {/* A real 404 (noindexed) instead of a soft-404 redirect home. */}
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes></Suspense></FlowsProvider></ProfileProvider></WalletProvider></AuthProvider></ThemeProvider></BrowserRouter>
);
export default App;
