import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
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

const App = () => (
  <BrowserRouter>
    <WalletProvider>
      <LinksProvider>
      <ProfileProvider>
      <MethodsProvider>
      <NoticesProvider>
      <FlowsProvider>
        <Toaster
          position="top-center"
          theme="dark"
          toastOptions={{
            classNames: {
              toast:
                "!rounded-2xl !border !border-white/10 !bg-[#101c16] !text-[#eaf2ed] !shadow-[0_20px_50px_-18px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)]",
              title: "!text-[13.5px] !font-semibold !tracking-tight",
              description: "!text-[12.5px] !text-[#8a988f]",
            },
          }}
        />
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
  </BrowserRouter>
);

export default App;
