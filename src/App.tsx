import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
const AdminWallet = lazy(() => import("./pages/AdminWallet"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminPricing = lazy(() => import("./pages/AdminPricing"));
const AdminAISupport = lazy(() => import("./pages/AdminAISupport"));
const AdminAIKnowledge = lazy(() => import("./pages/AdminAIKnowledge"));
const AdminSupportInbox = lazy(() => import("./pages/AdminSupportInbox"));
const AdminContact = lazy(() => import("./pages/AdminContact"));
const AdminLegal = lazy(() => import("./pages/AdminLegal"));

function ThemedToaster() { const { resolved } = useTheme(); return <Toaster position="top-center" theme={resolved} toastOptions={{ classNames: { toast: "!rounded-2xl !border !border-white/10 !bg-[var(--toast-bg)] !text-[var(--toast-ink)] !shadow-[var(--toast-shadow)]", title: "!text-[13.5px] !font-semibold !tracking-tight", description: "!text-[12.5px] !text-ink-dim" } }} />; }
/** Shown while a route chunk downloads. */
function RouteFallback() { return <div className="onyx-canvas grid min-h-dvh place-items-center"><Loader2 className="animate-spin text-primary-glow" size={24} /></div>; }

/* Public pages render immediately — RequireAuth/RequireAdmin show their own
   loaders while the session resolves, so nothing waits on auth to paint.
   That first-paint speed is also what crawlers measure. */
const App = () => (
  <BrowserRouter><ThemeProvider><AuthProvider><WalletProvider><ProfileProvider><FlowsProvider><ThemedToaster /><Suspense fallback={<RouteFallback />}><Routes>
    {/* Focused, chrome-free task pages. */}
    <Route path="/auth" element={<Auth />} /><Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}><Route index element={<Admin />} /><Route path="orders" element={<AdminOrders />} /><Route path="disputes" element={<AdminDisputes />} /><Route path="reviews" element={<AdminReviews />} /><Route path="sales/pricing" element={<AdminPricing />} /><Route path="suppliers" element={<AdminSuppliers />} /><Route path="wallet" element={<AdminWallet />} /><Route path="users" element={<AdminUsers />} /><Route path="contacts/information" element={<AdminContact />} /><Route path="legal" element={<AdminLegal />} /><Route path="ai-support" element={<AdminAISupport />} /><Route path="ai-knowledge" element={<AdminAIKnowledge />} /><Route path="support-inbox" element={<AdminSupportInbox />} /></Route>
    {/* One shell for the whole site: the same header and footer wrap the
        marketing pages, the shop and the account area. */}
    <Route element={<PublicShell />}>
      {/* Marketing pages lay out their own full-bleed sections. */}
      <Route path="/" element={<Home />} />
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
      <Route path="/support" element={<Support />} />
      <Route path="/legal/:slug" element={<LegalDocument />} />
      {/* App pages render inside the standard content column. */}
      <Route element={<AppPage />}>
        <Route path="/shop" element={<Shop />} />
        <Route path="/track-order" element={<TrackOrder />} /><Route path="/payment/success" element={<PaymentSuccess />} />
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
