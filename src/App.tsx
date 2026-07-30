import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider, useTheme } from "@/store/theme";
import { WalletProvider } from "@/store/wallet";
import { LinksProvider } from "@/store/links";
import { ProfileProvider } from "@/store/profile";
import { MethodsProvider } from "@/store/methods";
import { NoticesProvider } from "@/store/notices";
import { FlowsProvider } from "@/store/flows";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import Services from "./pages/Services";
import Payments from "./pages/Payments";
import Wallet from "./pages/Wallet";
import Account from "./pages/Account";

/** Sonner toaster that follows the active theme. */
function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      position="top-center"
      theme={resolved}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border !border-white/10 !bg-[var(--toast-bg)] !text-[var(--toast-ink)] !shadow-[var(--toast-shadow)]",
          title: "!text-[13.5px] !font-semibold !tracking-tight",
          description: "!text-[12.5px] !text-ink-dim",
        },
      }}
    />
  );
}

const App = () => (
  <BrowserRouter>
    <ThemeProvider>
    <WalletProvider>
      <LinksProvider>
      <ProfileProvider>
      <MethodsProvider>
      <NoticesProvider>
      <FlowsProvider>
        <ThemedToaster />
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/services" element={<Services />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </FlowsProvider>
      </NoticesProvider>
      </MethodsProvider>
      </ProfileProvider>
      </LinksProvider>
    </WalletProvider>
    </ThemeProvider>
  </BrowserRouter>
);

export default App;
