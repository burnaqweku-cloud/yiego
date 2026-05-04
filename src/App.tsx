import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AdminProvider } from "@/contexts/AdminContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SecurityGateProvider } from "@/contexts/SecurityContext";
import { SystemStatusProvider } from "@/contexts/SystemStatusContext";
import { SiteNoticeProvider } from "@/contexts/SiteNoticeContext";
import WhatsAppChannelButton from "@/components/layout/WhatsAppButton";
import GlobalAISupportChat from "@/components/support/GlobalAISupportChat";
import CampaignBannerRenderer from "@/components/banners/CampaignBannerRenderer";
import PublicRoute from "@/components/routing/PublicRoute";
import PrivateRoute from "@/components/routing/PrivateRoute";
import AgentRoute from "@/components/routing/AgentRoute";
import AdminRoute from "@/components/routing/AdminRoute";
import AgentFeatureGate from "@/components/routing/AgentFeatureGate";
import { PageTrackerProvider } from "@/components/layout/PageTrackerProvider";
import StructuredData from "@/components/seo/StructuredData";
import DomainRedirect from "@/components/seo/DomainRedirect";
import ScrollToTop from "@/components/layout/ScrollToTop";
import MaintenanceGuard from "./components/routing/MaintenanceGuard";
import PWATracker from "./components/layout/PWATracker";
import UpdateToast from "./components/layout/UpdateToast";
import { useOneSignal } from "./hooks/useOneSignal";
import { lazy, Suspense } from "react";

// ─── Eagerly loaded pages (public / critical path) ───
import Index from "./pages/Index";
import BuyData from "./pages/BuyData";
import Checkout from "./pages/Checkout";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// ─── Lazy-loaded pages ───
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const TrackOrder = lazy(() => import("./pages/TrackOrder"));
const PaystackCallback = lazy(() => import("./pages/PaystackCallback"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Support = lazy(() => import("./pages/Support"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Disclaimer = lazy(() => import("./pages/Disclaimer"));
const AppRedirect = lazy(() => import("./pages/AppRedirect"));
const AppAndroid = lazy(() => import("./pages/AppAndroid"));
const AppIOS = lazy(() => import("./pages/AppIOS"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Blog = lazy(() => import("./pages/Blog"));
const AISupport = lazy(() => import("./pages/AISupport"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const NetworkLanding = lazy(() => import("./pages/NetworkLanding"));
const Banned = lazy(() => import("./pages/Banned"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const ReferralLanding = lazy(() => import("./pages/ReferralLanding"));
const ReferralTerms = lazy(() => import("./pages/ReferralTerms"));
const BecomeAgent = lazy(() => import("./pages/BecomeAgent"));
const AgentStore = lazy(() => import("./pages/AgentStore"));

// Dashboard (lazy)
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const DashboardWallet = lazy(() => import("./pages/dashboard/DashboardWallet"));
const DashboardOrders = lazy(() => import("./pages/dashboard/DashboardOrders"));
const DashboardOrderDetail = lazy(() => import("./pages/dashboard/DashboardOrderDetail"));
const DashboardBuyData = lazy(() => import("./pages/dashboard/DashboardBuyData"));
const DashboardServices = lazy(() => import("./pages/dashboard/DashboardServices"));
const DashboardMore = lazy(() => import("./pages/dashboard/DashboardMore"));
const DashboardProfile = lazy(() => import("./pages/dashboard/DashboardProfile"));
const DashboardSettings = lazy(() => import("./pages/dashboard/DashboardSettings"));
const DashboardNotifications = lazy(() => import("./pages/dashboard/DashboardNotifications"));
const DashboardTransactions = lazy(() => import("./pages/dashboard/DashboardTransactions"));
const DashboardSupport = lazy(() => import("./pages/dashboard/DashboardSupport"));
const DashboardReferral = lazy(() => import("./pages/dashboard/DashboardReferral"));
const DashboardBulkPurchase = lazy(() => import("./pages/dashboard/DashboardBulkPurchase"));
const DashboardBulkOrders = lazy(() => import("./pages/dashboard/DashboardBulkOrders"));
const DashboardRewards = lazy(() => import("./pages/dashboard/DashboardRewards"));
const RewardActivation = lazy(() => import("./pages/RewardActivation"));
const RewardUnlocked = lazy(() => import("./pages/RewardUnlocked"));
const ConnectTelegram = lazy(() => import("./pages/dashboard/ConnectTelegram"));

// Telegram Mini Apps (lazy) — only loaded when /tg/* routes are hit
const TgMiniAppLayout = lazy(() => import("./pages/tg/TgMiniAppLayout"));
const TgLink = lazy(() => import("./pages/tg/TgLink"));
const TgSignup = lazy(() => import("./pages/tg/TgSignup"));
const TgDeposit = lazy(() => import("./pages/tg/TgDeposit"));
const TgDepositSuccess = lazy(() => import("./pages/tg/TgDepositSuccess"));
const TgPay = lazy(() => import("./pages/tg/TgPay"));
const TgPaySuccess = lazy(() => import("./pages/tg/TgPaySuccess"));

// Agent (lazy)
const AgentRouter = lazy(() => import("./pages/agent/AgentRouter"));
const AgentActivate = lazy(() => import("./pages/agent/AgentActivate"));
const AgentSubscriptionCallback = lazy(() => import("./pages/agent/AgentSubscriptionCallback"));
const AgentDashboard = lazy(() => import("./pages/agent/AgentDashboard"));
const AgentOrders = lazy(() => import("./pages/agent/AgentOrders"));
const AgentEarnings = lazy(() => import("./pages/agent/AgentEarnings"));
const AgentWithdrawals = lazy(() => import("./pages/agent/AgentWithdrawals"));
const AgentTransactions = lazy(() => import("./pages/agent/AgentTransactions"));
const AgentStoreSettings = lazy(() => import("./pages/agent/AgentStoreSettings"));
const AgentPricing = lazy(() => import("./pages/agent/AgentPricing"));
const AgentCustomers = lazy(() => import("./pages/agent/AgentCustomers"));
const AgentMarketingTools = lazy(() => import("./pages/agent/AgentMarketingTools"));
const AgentWholesale = lazy(() => import("./pages/agent/AgentWholesale"));
const AgentWholesaleHistory = lazy(() => import("./pages/agent/AgentWholesaleHistory"));
const AgentWholesaleOrderDetail = lazy(() => import("./pages/agent/AgentWholesaleOrderDetail"));
const AgentSupport = lazy(() => import("./pages/agent/AgentSupport"));
const AgentSubscription = lazy(() => import("./pages/agent/AgentSubscription"));

// Admin (lazy)
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminCreateOrder = lazy(() => import("./pages/admin/AdminCreateOrder"));
const AdminBulkCreateOrder = lazy(() => import("./pages/admin/AdminBulkCreateOrder"));
const AdminBulkOrders = lazy(() => import("./pages/admin/AdminBulkOrders"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminNotices = lazy(() => import("./pages/admin/AdminNotices"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminNetworkAvailability = lazy(() => import("./pages/admin/AdminNetworkAvailability"));
const AdminSystemStatus = lazy(() => import("./pages/admin/AdminSystemStatus"));
const AdminWalletOverview = lazy(() => import("./pages/admin/AdminWalletOverview"));
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing"));
const AdminIntegrationTest = lazy(() => import("./pages/admin/AdminIntegrationTest"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSupplier = lazy(() => import("./pages/admin/AdminSupplier"));
const AdminSuppliers = lazy(() => import("./pages/admin/AdminSuppliers"));
const AdminRouting = lazy(() => import("./pages/admin/AdminRouting"));
const AdminSupport = lazy(() => import("./pages/admin/AdminSupport"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AdminAuditLogs"));
const AdminManagerReview = lazy(() => import("./pages/admin/AdminManagerReview"));
const AdminRoles = lazy(() => import("./pages/admin/AdminRoles"));
const AdminUserDetail = lazy(() => import("./pages/admin/AdminUserDetail"));
const AdminFinanceReport = lazy(() => import("./pages/admin/AdminFinanceReport"));
const AdminFinanceLedger = lazy(() => import("./pages/admin/AdminFinanceLedger"));
const AdminFinanceCategories = lazy(() => import("./pages/admin/AdminFinanceCategories"));
const AdminFinanceSnapshots = lazy(() => import("./pages/admin/AdminFinanceSnapshots"));
const AdminReconciliation = lazy(() => import("./pages/admin/AdminReconciliation"));
const AdminTransactions = lazy(() => import("./pages/admin/AdminTransactions"));
const AdminPaymentIntents = lazy(() => import("./pages/admin/AdminPaymentIntents"));
const AdminFinanceOverview = lazy(() => import("./pages/admin/AdminFinanceOverview"));
const AdminAgents = lazy(() => import("./pages/admin/AdminAgents"));
const AdminActiveAgents = lazy(() => import("./pages/admin/AdminActiveAgents"));
const AdminAgentWithdrawals = lazy(() => import("./pages/admin/AdminAgentWithdrawals"));
const AdminAgentOverview = lazy(() => import("./pages/admin/AdminAgentOverview"));
const AdminAgentApplications = lazy(() => import("./pages/admin/AdminAgentApplications"));
const AdminAgentDirectory = lazy(() => import("./pages/admin/AdminAgentDirectory"));
const AdminAgentProfile = lazy(() => import("./pages/admin/AdminAgentProfile"));
const AdminAgentActivity = lazy(() => import("./pages/admin/AdminAgentActivity"));
const AdminAgentProfitDiagnostics = lazy(() => import("./pages/admin/AdminAgentProfitDiagnostics"));
const AdminNotificationSender = lazy(() => import("./pages/admin/AdminNotificationSender"));
const AdminWalletDeposits = lazy(() => import("./pages/admin/AdminWalletDeposits"));
const AdminBlog = lazy(() => import("./pages/admin/AdminBlog"));
const AdminSEO = lazy(() => import("./pages/admin/AdminSEO"));
const AdminSupportCenter = lazy(() => import("./pages/admin/AdminSupportCenter"));
const AdminSupportTickets = lazy(() => import("./pages/admin/AdminSupportTickets"));
const AdminSupportTicketDetail = lazy(() => import("./pages/admin/AdminSupportTicketDetail"));
const AdminSMSSettings = lazy(() => import("./pages/admin/AdminSMSSettings"));
const AdminDeposits = lazy(() => import("./pages/admin/AdminDeposits"));
const AdminDeliveryCheckpoints = lazy(() => import("./pages/admin/AdminDeliveryCheckpoints"));
const AdminDeliveryTrackerControl = lazy(() => import("./pages/admin/AdminDeliveryTrackerControl"));
const AdminOrderDiagnostics = lazy(() => import("./pages/admin/AdminOrderDiagnostics"));
const AdminPWAUsers = lazy(() => import("./pages/admin/AdminPWAUsers"));
const AdminReferralCampaign = lazy(() => import("./pages/admin/AdminReferralCampaign"));
const AdminMaintenanceMode = lazy(() => import("./pages/admin/AdminMaintenanceMode"));
const AdminRewardClaims = lazy(() => import("./pages/admin/AdminRewardClaims"));
const AdminReferralReview = lazy(() => import("./pages/admin/AdminReferralReview"));
const AdminPhoneCleanup = lazy(() => import("./pages/admin/AdminPhoneCleanup"));
const AdminSecurity = lazy(() => import("./pages/admin/AdminSecurity"));
const AdminLeaderboardRewards = lazy(() => import("./pages/admin/AdminLeaderboardRewards"));
const AdminAICases = lazy(() => import("./pages/admin/AdminAICases"));
const AdminAITicketDetail = lazy(() => import("./pages/admin/AdminAITicketDetail"));
const AdminBulkDispatchQueue = lazy(() => import("./pages/admin/AdminBulkDispatchQueue"));
const AdminSupplierCEarnings = lazy(() => import("./pages/admin/AdminSupplierCEarnings"));
const AdminAIMonitor = lazy(() => import("./pages/admin/AdminAIMonitor"));
const AdminLoyalty = lazy(() => import("./pages/admin/AdminLoyalty"));
const AdminTelegramPoints = lazy(() => import("./pages/admin/AdminTelegramPoints"));
const AdminCampaignBanners = lazy(() => import("./pages/admin/AdminCampaignBanners"));

// Telegram Bot admin section
const TgDashboard = lazy(() => import("./pages/admin/tg/TgDashboard"));
const TgUsers = lazy(() => import("./pages/admin/tg/TgUsers"));
const TgOrders = lazy(() => import("./pages/admin/tg/TgOrders"));
const TgDeposits = lazy(() => import("./pages/admin/tg/TgDeposits"));
const TgPoints = lazy(() => import("./pages/admin/tg/TgPoints"));
const TgReferrals = lazy(() => import("./pages/admin/tg/TgReferrals"));
const TgCheckins = lazy(() => import("./pages/admin/tg/TgCheckins"));
const TgRedemptions = lazy(() => import("./pages/admin/tg/TgRedemptions"));
const TgSupport = lazy(() => import("./pages/admin/tg/TgSupport"));
const TgBroadcasts = lazy(() => import("./pages/admin/tg/TgBroadcasts"));
const TgPromotions = lazy(() => import("./pages/admin/tg/TgPromotions"));
const TgBotHealth = lazy(() => import("./pages/admin/tg/TgBotHealth"));
const TgConfiguration = lazy(() => import("./pages/admin/tg/TgConfiguration"));
const TgAuditLog = lazy(() => import("./pages/admin/tg/TgAuditLog"));
const TgReports = lazy(() => import("./pages/admin/tg/TgReports"));
const TgUserDetail = lazy(() => import("./pages/admin/tg/TgUserDetail"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 30s, then revalidate in background — perceived instant w/o request storms
      staleTime: 30_000,
      gcTime: 10 * 60 * 1000,
      // Re-fetch when user returns to tab (mobile lock-screen, tab switch, etc.)
      refetchOnWindowFocus: true,
      // Re-fetch when network comes back online — critical for mobile users
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

// Inner component so hooks can access AuthProvider context
const AppContent = () => {
  useOneSignal();
  return null;
};

/**
 * Minimal route-transition fallback.
 *
 * Why NOT a fullscreen loader: a fullscreen overlay during React.lazy chunk
 * fetch causes the persistent shell (DashboardHeader + BottomNav) to disappear
 * on tab switches, which feels like a full-page reset. Instead we render an
 * unobtrusive top progress bar so the previously-mounted page remains visible
 * underneath until the next chunk resolves. Cached chunks are instant, so this
 * only ever briefly appears on the first cold load of a route.
 */
const LazyFallback = () => (
  <div
    aria-hidden
    className="fixed top-0 left-0 right-0 h-[2px] z-[9999] overflow-hidden pointer-events-none"
  >
    <div
      className="h-full w-1/3 animate-route-progress"
      style={{
        background:
          'linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)',
      }}
    />
  </div>
);

const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <AdminProvider>
            <SystemStatusProvider>
            <SiteNoticeProvider>
            <PageTrackerProvider>
            <AppContent />
            <StructuredData />
            <DomainRedirect />
            <ScrollToTop />
            <PWATracker />
            <Toaster />
            <Sonner />
            <UpdateToast />
            {/* Floating widgets temporarily hidden */}
            {/* <WhatsAppChannelButton /> */}
            {/* <GlobalAISupportChat /> */}
            <CampaignBannerRenderer />
            <SecurityGateProvider>
            <MaintenanceGuard>
            <Suspense fallback={<LazyFallback />}>
            <Routes>
              {/* Banned page — always accessible */}
              <Route path="/banned" element={<Banned />} />
              {/* Maintenance page — always accessible */}
              <Route path="/maintenance" element={<Maintenance />} />
              {/* Public pages — redirect authenticated users to dashboard */}
              <Route path="/" element={<PublicRoute redirectIfAuth><Index /></PublicRoute>} />
              <Route path="/auth" element={<PublicRoute redirectIfAuth><Auth /></PublicRoute>} />

              {/* Public pages — accessible to everyone */}
              <Route path="/buy-data" element={<BuyData />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order-confirmation" element={<OrderConfirmation />} />
              <Route path="/paystack/callback" element={<PaystackCallback />} />
              <Route path="/track-order" element={<TrackOrder />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/support" element={<Support />} />
              <Route path="/ai-support" element={<AISupport />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/disclaimer" element={<Disclaimer />} />
              <Route path="/app" element={<AppRedirect />} />
              <Route path="/app/android" element={<AppAndroid />} />
              <Route path="/app/ios" element={<AppIOS />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              {/* Legacy network landing routes (kept for inbound links) */}
              <Route path="/buy-mtn-data-bundles-ghana" element={<NetworkLanding />} />
              <Route path="/buy-telecel-data-bundles-ghana" element={<NetworkLanding />} />
              <Route path="/buy-airteltigo-data-bundles-ghana" element={<NetworkLanding />} />
              <Route path="/cheap-data-bundles-ghana" element={<NetworkLanding />} />
              <Route path="/buy-data-online-ghana" element={<NetworkLanding />} />
              <Route path="/mtn-data-prices-ghana" element={<NetworkLanding />} />
              <Route path="/telecel-data-prices-ghana" element={<NetworkLanding />} />
              <Route path="/airteltigo-data-prices-ghana" element={<NetworkLanding />} />

              {/* SEO-canonical network landing routes */}
              <Route path="/mtn-data-bundles-ghana" element={<NetworkLanding />} />
              <Route path="/telecel-data-bundles-ghana" element={<NetworkLanding />} />
              <Route path="/airteltigo-data-bundles-ghana" element={<NetworkLanding />} />
              {/* 301-style client redirect for legacy Vodafone search intent */}
              <Route path="/vodafone-data-bundles-ghana" element={<Navigate to="/telecel-data-bundles-ghana" replace />} />
              <Route path="/vodafone-data-prices-ghana" element={<Navigate to="/telecel-data-prices-ghana" replace />} />
              <Route path="/cheapest-data-bundles-ghana" element={<NetworkLanding />} />

              {/* Bundle-type landing routes */}
              {/* Deprecated bundle-type slugs — redirect to all-bundles page */}
              <Route path="/daily-data-bundles-ghana" element={<Navigate to="/buy-data" replace />} />
              <Route path="/weekly-data-bundles-ghana" element={<Navigate to="/buy-data" replace />} />
              <Route path="/monthly-data-bundles-ghana" element={<Navigate to="/buy-data" replace />} />
              <Route path="/social-media-bundles-ghana" element={<Navigate to="/buy-data" replace />} />
              <Route path="/whatsapp-data-bundles-ghana" element={<Navigate to="/buy-data" replace />} />
              <Route path="/youtube-data-bundles-ghana" element={<Navigate to="/buy-data" replace />} />
              <Route path="/unlimited-data-ghana" element={<Navigate to="/cheapest-data-bundles-ghana" replace />} />

              {/* Location landing routes */}
              <Route path="/buy-data-bundles-accra" element={<NetworkLanding />} />
              <Route path="/buy-data-bundles-kumasi" element={<NetworkLanding />} />
              <Route path="/buy-data-bundles-tamale" element={<NetworkLanding />} />
              <Route path="/buy-data-bundles-takoradi" element={<NetworkLanding />} />
              <Route path="/buy-data-bundles-cape-coast" element={<NetworkLanding />} />
              {/* Referral campaign landing pages */}
              <Route path="/r/:referral_code" element={<ReferralLanding />} />
              <Route path="/invite/:referral_code" element={<ReferralLanding />} />
              <Route path="/referral-terms" element={<ReferralTerms />} />

              {/* Reward activation flow */}
              <Route path="/reward-activation" element={<PrivateRoute><RewardActivation /></PrivateRoute>} />
              <Route path="/reward" element={<PrivateRoute><RewardActivation /></PrivateRoute>} />
              <Route path="/reward-unlocked" element={<PrivateRoute><RewardUnlocked /></PrivateRoute>} />

              {/* Agent store — public, no YieGo branding */}
              <Route path="/store/:slug" element={<AgentFeatureGate><AgentStore /></AgentFeatureGate>} />

              {/* Agent smart router — public landing page, redirects logged-in agents */}
              <Route path="/agent" element={<AgentFeatureGate><AgentRouter /></AgentFeatureGate>} />

              {/* Become an agent — accessible to guests and logged-in users */}
              <Route path="/become-an-agent" element={<AgentFeatureGate><BecomeAgent /></AgentFeatureGate>} />

              {/* Agent activation — requires auth + approved agent */}
              <Route path="/agent/activate" element={<AgentFeatureGate><PrivateRoute><AgentActivate /></PrivateRoute></AgentFeatureGate>} />
              <Route path="/agent/subscription/callback" element={<AgentFeatureGate><PrivateRoute><AgentSubscriptionCallback /></PrivateRoute></AgentFeatureGate>} />

              {/* Agent dashboard — requires active agent */}
              <Route path="/agent/dashboard" element={<AgentFeatureGate><AgentRoute><AgentDashboard /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/orders" element={<AgentFeatureGate><AgentRoute><AgentOrders /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/earnings" element={<AgentFeatureGate><AgentRoute><AgentEarnings /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/withdrawals" element={<AgentFeatureGate><AgentRoute><AgentWithdrawals /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/transactions" element={<AgentFeatureGate><AgentRoute><AgentTransactions /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/store-settings" element={<AgentFeatureGate><AgentRoute><AgentStoreSettings /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/pricing" element={<AgentFeatureGate><AgentRoute><AgentPricing /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/customers" element={<AgentFeatureGate><AgentRoute><AgentCustomers /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/support" element={<AgentFeatureGate><AgentRoute><AgentSupport /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/marketing" element={<AgentFeatureGate><AgentRoute><AgentMarketingTools /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/subscription" element={<AgentFeatureGate><AgentRoute><AgentSubscription /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/wholesale" element={<AgentFeatureGate><AgentRoute><AgentWholesale /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/bulk-purchase" element={<AgentFeatureGate><AgentRoute><AgentWholesale /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/wholesale/history" element={<AgentFeatureGate><AgentRoute><AgentWholesaleHistory /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/bulk-orders" element={<AgentFeatureGate><AgentRoute><AgentWholesaleHistory /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/wholesale/orders/:orderId" element={<AgentFeatureGate><AgentRoute><AgentWholesaleOrderDetail /></AgentRoute></AgentFeatureGate>} />
              <Route path="/agent/bulk-purchase/orders/:orderId" element={<AgentFeatureGate><AgentRoute><AgentWholesaleOrderDetail /></AgentRoute></AgentFeatureGate>} />

              {/* Dashboard routes — require authentication */}
              <Route path="/dashboard" element={<PrivateRoute><DashboardHome /></PrivateRoute>} />
              <Route path="/dashboard/buy" element={<PrivateRoute><DashboardBuyData /></PrivateRoute>} />
              <Route path="/dashboard/services" element={<PrivateRoute><DashboardServices /></PrivateRoute>} />
              <Route path="/dashboard/more" element={<PrivateRoute><DashboardMore /></PrivateRoute>} />
              <Route path="/dashboard/wallet" element={<PrivateRoute><DashboardWallet /></PrivateRoute>} />
              <Route path="/dashboard/orders" element={<PrivateRoute><DashboardOrders /></PrivateRoute>} />
              <Route path="/dashboard/orders/:orderId" element={<PrivateRoute><DashboardOrderDetail /></PrivateRoute>} />
              <Route path="/dashboard/profile" element={<PrivateRoute><DashboardProfile /></PrivateRoute>} />
              <Route path="/dashboard/settings" element={<PrivateRoute><DashboardSettings /></PrivateRoute>} />
              <Route path="/dashboard/notifications" element={<PrivateRoute><DashboardNotifications /></PrivateRoute>} />
              <Route path="/dashboard/connect-telegram" element={<PrivateRoute><ConnectTelegram /></PrivateRoute>} />
              <Route path="/dashboard/transactions" element={<PrivateRoute><DashboardTransactions /></PrivateRoute>} />
              <Route path="/dashboard/support" element={<PrivateRoute><DashboardSupport /></PrivateRoute>} />
              <Route path="/dashboard/referral" element={<PrivateRoute><DashboardReferral /></PrivateRoute>} />
              <Route path="/dashboard/rewards" element={<PrivateRoute><DashboardRewards /></PrivateRoute>} />
              <Route path="/rewards" element={<PrivateRoute><DashboardRewards /></PrivateRoute>} />
              <Route path="/dashboard/bulk-purchase" element={<PrivateRoute><DashboardBulkPurchase /></PrivateRoute>} />
              <Route path="/dashboard/bulk-orders" element={<PrivateRoute><DashboardBulkOrders /></PrivateRoute>} />

              {/* Admin routes — require admin or staff role */}
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
              <Route path="/admin/orders" element={<AdminRoute><AdminOrders /></AdminRoute>} />
              <Route path="/admin/orders/create" element={<AdminRoute><AdminCreateOrder /></AdminRoute>} />
              <Route path="/admin/orders/bulk" element={<AdminRoute><AdminBulkCreateOrder /></AdminRoute>} />
              <Route path="/admin/bulk-orders" element={<AdminRoute><AdminBulkOrders /></AdminRoute>} />
              <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
              <Route path="/admin/users/:userId" element={<AdminRoute><AdminUserDetail /></AdminRoute>} />
              <Route path="/admin/wallet" element={<AdminRoute><AdminWalletOverview /></AdminRoute>} />
              <Route path="/admin/finance" element={<AdminRoute><AdminFinanceReport /></AdminRoute>} />
              <Route path="/admin/finance-overview" element={<AdminRoute><AdminFinanceOverview /></AdminRoute>} />
              <Route path="/admin/finance-ledger" element={<AdminRoute><AdminFinanceLedger /></AdminRoute>} />
              <Route path="/admin/finance-categories" element={<AdminRoute><AdminFinanceCategories /></AdminRoute>} />
              <Route path="/admin/finance-snapshots" element={<AdminRoute><AdminFinanceSnapshots /></AdminRoute>} />
              <Route path="/admin/reconciliation" element={<AdminRoute><AdminReconciliation /></AdminRoute>} />
              <Route path="/admin/transactions" element={<AdminRoute><AdminTransactions /></AdminRoute>} />
              <Route path="/admin/payment-intents" element={<AdminRoute><AdminPaymentIntents /></AdminRoute>} />
              <Route path="/admin/products" element={<AdminRoute><AdminProducts /></AdminRoute>} />
              <Route path="/admin/pricing" element={<AdminRoute><AdminPricing /></AdminRoute>} />
              <Route path="/admin/supplier" element={<AdminRoute><AdminSupplier /></AdminRoute>} />
              <Route path="/admin/suppliers" element={<AdminRoute><AdminSuppliers /></AdminRoute>} />
              <Route path="/admin/routing" element={<AdminRoute><AdminRouting /></AdminRoute>} />
              <Route path="/admin/notices" element={<AdminRoute><AdminNotices /></AdminRoute>} />
              <Route path="/admin/system-status" element={<AdminRoute><AdminSystemStatus /></AdminRoute>} />
              <Route path="/admin/network-availability" element={<AdminRoute><AdminNetworkAvailability /></AdminRoute>} />
              <Route path="/admin/integration-test" element={<AdminRoute><AdminIntegrationTest /></AdminRoute>} />
              <Route path="/admin/support" element={<AdminRoute><AdminSupportCenter /></AdminRoute>} />
              <Route path="/admin/support-center" element={<AdminRoute><AdminSupportCenter /></AdminRoute>} />
              <Route path="/admin/support-tickets" element={<AdminRoute><AdminSupportTickets /></AdminRoute>} />
              <Route path="/admin/support-tickets/:ticketId" element={<AdminRoute><AdminSupportTicketDetail /></AdminRoute>} />
              <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
              <Route path="/admin/roles" element={<AdminRoute><AdminRoles /></AdminRoute>} />
              <Route path="/admin/audit-logs" element={<AdminRoute><AdminAuditLogs /></AdminRoute>} />
              <Route path="/admin/agents" element={<AdminRoute><AdminAgentOverview /></AdminRoute>} />
              <Route path="/admin/agents/applications" element={<AdminRoute><AdminAgentApplications /></AdminRoute>} />
              <Route path="/admin/agents/list" element={<AdminRoute><AdminAgentDirectory /></AdminRoute>} />
              <Route path="/admin/agents/active" element={<AdminRoute><AdminActiveAgents /></AdminRoute>} />
              <Route path="/admin/agents/:agentId" element={<AdminRoute><AdminAgentProfile /></AdminRoute>} />
              <Route path="/admin/agents/withdrawals" element={<AdminRoute><AdminAgentWithdrawals /></AdminRoute>} />
              <Route path="/admin/agents/activity" element={<AdminRoute><AdminAgentActivity /></AdminRoute>} />
              <Route path="/admin/agents/profit-diagnostics" element={<AdminRoute><AdminAgentProfitDiagnostics /></AdminRoute>} />
              <Route path="/admin/notifications" element={<AdminRoute><AdminNotificationSender /></AdminRoute>} />
              <Route path="/admin/sms-settings" element={<AdminRoute><AdminSMSSettings /></AdminRoute>} />
              <Route path="/admin/blog" element={<AdminRoute><AdminBlog /></AdminRoute>} />
              <Route path="/admin/seo" element={<AdminRoute><AdminSEO /></AdminRoute>} />
              <Route path="/admin/deposits" element={<AdminRoute><AdminDeposits /></AdminRoute>} />
              <Route path="/admin/delivery-checkpoints" element={<AdminRoute><AdminDeliveryCheckpoints /></AdminRoute>} />
              <Route path="/admin/delivery-tracker-control" element={<AdminRoute><AdminDeliveryTrackerControl /></AdminRoute>} />
              <Route path="/admin/order-diagnostics" element={<AdminRoute><AdminOrderDiagnostics /></AdminRoute>} />
              <Route path="/admin/pwa-users" element={<AdminRoute><AdminPWAUsers /></AdminRoute>} />
              <Route path="/admin/referral" element={<AdminRoute><AdminReferralCampaign /></AdminRoute>} />
              <Route path="/admin/reward-claims" element={<AdminRoute><AdminRewardClaims /></AdminRoute>} />
              <Route path="/admin/maintenance" element={<AdminRoute><AdminMaintenanceMode /></AdminRoute>} />
              <Route path="/admin/referral-review" element={<AdminRoute><AdminReferralReview /></AdminRoute>} />
              <Route path="/admin/phone-cleanup" element={<AdminRoute><AdminPhoneCleanup /></AdminRoute>} />
              <Route path="/admin/security" element={<AdminRoute><AdminSecurity /></AdminRoute>} />
              <Route path="/admin/leaderboard-rewards" element={<AdminRoute><AdminLeaderboardRewards /></AdminRoute>} />
              <Route path="/admin/bulk-dispatch" element={<AdminRoute><AdminBulkDispatchQueue /></AdminRoute>} />
              <Route path="/admin/supplier-c-earnings" element={<AdminRoute><AdminSupplierCEarnings /></AdminRoute>} />
              <Route path="/admin/ai-cases" element={<AdminRoute><AdminAICases /></AdminRoute>} />
              <Route path="/admin/ai-cases/:ticketId" element={<AdminRoute><AdminAITicketDetail /></AdminRoute>} />
              <Route path="/admin/manager-review" element={<AdminRoute><AdminManagerReview /></AdminRoute>} />
              <Route path="/admin/ai-monitor" element={<AdminRoute><AdminAIMonitor /></AdminRoute>} />
              <Route path="/admin/loyalty" element={<AdminRoute><AdminLoyalty /></AdminRoute>} />
              <Route path="/admin/telegram-points" element={<AdminRoute><AdminTelegramPoints /></AdminRoute>} />
              <Route path="/admin/banners" element={<AdminRoute><AdminCampaignBanners /></AdminRoute>} />

              {/* Telegram Bot admin section */}
              <Route path="/admin/tg" element={<AdminRoute><TgDashboard /></AdminRoute>} />
              <Route path="/admin/tg/users" element={<AdminRoute><TgUsers /></AdminRoute>} />
              <Route path="/admin/tg/users/:chatId" element={<AdminRoute><TgUserDetail /></AdminRoute>} />
              <Route path="/admin/tg/orders" element={<AdminRoute><TgOrders /></AdminRoute>} />
              <Route path="/admin/tg/deposits" element={<AdminRoute><TgDeposits /></AdminRoute>} />
              <Route path="/admin/tg/points" element={<AdminRoute><TgPoints /></AdminRoute>} />
              <Route path="/admin/tg/referrals" element={<AdminRoute><TgReferrals /></AdminRoute>} />
              <Route path="/admin/tg/checkins" element={<AdminRoute><TgCheckins /></AdminRoute>} />
              <Route path="/admin/tg/redemptions" element={<AdminRoute><TgRedemptions /></AdminRoute>} />
              <Route path="/admin/tg/support" element={<AdminRoute><TgSupport /></AdminRoute>} />
              <Route path="/admin/tg/broadcasts" element={<AdminRoute><TgBroadcasts /></AdminRoute>} />
              <Route path="/admin/tg/promotions" element={<AdminRoute><TgPromotions /></AdminRoute>} />
              <Route path="/admin/tg/health" element={<AdminRoute><TgBotHealth /></AdminRoute>} />
              <Route path="/admin/tg/configuration" element={<AdminRoute><TgConfiguration /></AdminRoute>} />
              <Route path="/admin/tg/audit" element={<AdminRoute><TgAuditLog /></AdminRoute>} />
              <Route path="/admin/tg/reports" element={<AdminRoute><TgReports /></AdminRoute>} />

              {/* Telegram Mini Apps — opened inside Telegram webview */}
              <Route path="/tg" element={<TgMiniAppLayout />}>
                <Route path="link" element={<TgLink />} />
                <Route path="signup" element={<TgSignup />} />
                <Route path="deposit" element={<TgDeposit />} />
                <Route path="deposit/success" element={<TgDepositSuccess />} />
                <Route path="pay" element={<TgPay />} />
                <Route path="pay/success" element={<TgPaySuccess />} />
              </Route>

              {/* Legacy route redirect */}
              <Route path="/admin/agent-withdrawals" element={<AdminRoute><AdminAgentWithdrawals /></AdminRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </MaintenanceGuard>
            </SecurityGateProvider>
            </PageTrackerProvider>
            </SiteNoticeProvider>
            </SystemStatusProvider>
          </AdminProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
