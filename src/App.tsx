import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { ThemeProvider, useTheme } from "@/store/theme";
import { AuthProvider } from "@/store/auth";
import { WalletProvider } from "@/store/wallet";
import { ProfileProvider } from "@/store/profile";
import { FlowsProvider } from "@/store/flows";
import AppShell from "@/components/layout/AppShell";
import PublicShell from "@/components/layout/PublicShell";
import Home from "./pages/Home";
// Tiny route guards — kept eager so gated pages don't wait on an extra chunk.
import RequireAdmin from "@/components/auth/RequireAdmin";
import RequireAuth from "@/components/auth/RequireAuth";
import { useAuth } from "@/store/auth-context";

/* Only the public homepage ships in the entry bundle. Every other route —
   the app, the admin suite, the informational pages — is fetched on demand,
   so a first-time visitor downloads a fraction of the code. */
const About = lazy(() => import("./pages/About"));
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
const AdminShell = lazy(() => import("@/components/admin/AdminShell"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const AdminReviews = lazy(() => import("./pages/AdminReviews"));
const AdminDisputes = lazy(() => import("./pages/AdminDisputes"));
const AdminSuppliers = lazy(() => import("./pages/AdminSuppliers"));
const AdminWallet = lazy(() => import("./pages/AdminWallet"));
const AdminPricing = lazy(() => import("./pages/AdminPricing"));
const AdminAISupport = lazy(() => import("./pages/AdminAISupport"));
const AdminContact = lazy(() => import("./pages/AdminContact"));
const AdminLegal = lazy(() => import("./pages/AdminLegal"));

function ThemedToaster() { const { resolved } = useTheme(); return <Toaster position="top-center" theme={resolved} toastOptions={{ classNames: { toast: "!rounded-2xl !border !border-white/10 !bg-[var(--toast-bg)] !text-[var(--toast-ink)] !shadow-[var(--toast-shadow)]", title: "!text-[13.5px] !font-semibold !tracking-tight", description: "!text-[12.5px] !text-ink-dim" } }} />; }
function AuthReady({ children }: { children: React.ReactNode }) { const { loading } = useAuth(); if (!loading) return <>{children}</>; return <div className="onyx-canvas grid min-h-dvh place-items-center"><Loader2 className="animate-spin text-primary-glow" size={24} /></div>; }
/** Shown while a route chunk downloads. */
function RouteFallback() { return <div className="onyx-canvas grid min-h-dvh place-items-center"><Loader2 className="animate-spin text-primary-glow" size={24} /></div>; }

const App = () => (
  <BrowserRouter><ThemeProvider><AuthProvider><WalletProvider><ProfileProvider><FlowsProvider><ThemedToaster /><AuthReady><Suspense fallback={<RouteFallback />}><Routes>
    <Route path="/auth" element={<Auth />} /><Route path="/reset-password" element={<ResetPassword />} /><Route path="/track-order" element={<TrackOrder />} />
    <Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}><Route index element={<Admin />} /><Route path="orders" element={<AdminOrders />} /><Route path="disputes" element={<AdminDisputes />} /><Route path="reviews" element={<AdminReviews />} /><Route path="sales/pricing" element={<AdminPricing />} /><Route path="suppliers" element={<AdminSuppliers />} /><Route path="wallet" element={<AdminWallet />} /><Route path="contacts/information" element={<AdminContact />} /><Route path="legal" element={<AdminLegal />} /><Route path="ai-support" element={<AdminAISupport />} /></Route>
    {/* Public site — marketing nav + full footer */}
    <Route element={<PublicShell />}>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/support" element={<Support />} />
      <Route path="/legal/:slug" element={<LegalDocument />} />
    </Route>
    {/* The app — unchanged behaviour, now rooted at /shop */}
    <Route element={<AppShell />}><Route path="/shop" element={<Shop />} /><Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} /><Route path="/wallet" element={<RequireAuth><Wallet /></RequireAuth>} /><Route path="/account" element={<RequireAuth><Account /></RequireAuth>} /><Route path="/support/ai" element={<AISupport />} /><Route path="*" element={<Navigate to="/" replace />} /></Route>
  </Routes></Suspense></AuthReady></FlowsProvider></ProfileProvider></WalletProvider></AuthProvider></ThemeProvider></BrowserRouter>
);
export default App;
