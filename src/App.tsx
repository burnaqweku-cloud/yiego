import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { ThemeProvider, useTheme } from "@/store/theme";
import { AuthProvider } from "@/store/auth";
import { WalletProvider } from "@/store/wallet";
import { ProfileProvider } from "@/store/profile";
import { FlowsProvider } from "@/store/flows";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Orders from "./pages/Orders";
import Account from "./pages/Account";
import Admin from "./pages/Admin";
import AdminOrders from "./pages/AdminOrders";
import AdminReviews from "./pages/AdminReviews";
import AdminSuppliers from "./pages/AdminSuppliers";
import AdminWallet from "./pages/AdminWallet";
import AdminPricing from "./pages/AdminPricing";
import AdminAISupport from "./pages/AdminAISupport";
import AdminShell from "@/components/admin/AdminShell";
import Auth from "./pages/Auth";
import TrackOrder from "./pages/TrackOrder";
import RequireAdmin from "@/components/auth/RequireAdmin";
import RequireAuth from "@/components/auth/RequireAuth";
import ResetPassword from "./pages/ResetPassword";
import { useAuth } from "@/store/auth-context";

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster position="top-center" theme={resolved} toastOptions={{ classNames: { toast: "!rounded-2xl !border !border-white/10 !bg-[var(--toast-bg)] !text-[var(--toast-ink)] !shadow-[var(--toast-shadow)]", title: "!text-[13.5px] !font-semibold !tracking-tight", description: "!text-[12.5px] !text-ink-dim" } }} />;
}

function AuthReady({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (!loading) return <>{children}</>;
  return <div className="onyx-canvas grid min-h-dvh place-items-center"><Loader2 className="animate-spin text-primary-glow" size={24} /></div>;
}

const App = () => (
  <BrowserRouter><ThemeProvider><AuthProvider><WalletProvider><ProfileProvider><FlowsProvider><ThemedToaster /><AuthReady><Routes>
    <Route path="/auth" element={<Auth />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/track-order" element={<TrackOrder />} />
    <Route path="/admin" element={<RequireAdmin><AdminShell /></RequireAdmin>}>
      <Route index element={<Admin />} />
      <Route path="orders" element={<AdminOrders />} />
      <Route path="reviews" element={<AdminReviews />} />
      <Route path="sales/pricing" element={<AdminPricing />} />
      <Route path="suppliers" element={<AdminSuppliers />} />
      <Route path="wallet" element={<AdminWallet />} />
      <Route path="ai-support" element={<AdminAISupport />} />
    </Route>
    <Route element={<AppShell />}><Route path="/" element={<Dashboard />} /><Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} /><Route path="/wallet" element={<RequireAuth><Wallet /></RequireAuth>} /><Route path="/account" element={<RequireAuth><Account /></RequireAuth>} /><Route path="*" element={<Navigate to="/" replace />} /></Route>
  </Routes></AuthReady></FlowsProvider></ProfileProvider></WalletProvider></AuthProvider></ThemeProvider></BrowserRouter>
);

export default App;
