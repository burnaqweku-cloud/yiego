import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import Services from "./pages/Services";
import Payments from "./pages/Payments";
import Wallet from "./pages/Wallet";
import Account from "./pages/Account";

const App = () => (
  <BrowserRouter>
    <Toaster position="top-center" theme="dark" richColors={false} />
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
  </BrowserRouter>
);

export default App;
