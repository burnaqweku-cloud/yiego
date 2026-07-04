import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import AppShell from "@/components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import ComingSoon from "./pages/ComingSoon";

const App = () => (
  <BrowserRouter>
    <Toaster position="top-center" theme="dark" richColors={false} />
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/services" element={<ComingSoon />} />
        <Route path="/payments" element={<ComingSoon />} />
        <Route path="/wallet" element={<ComingSoon />} />
        <Route path="/account" element={<ComingSoon />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </BrowserRouter>
);

export default App;
