import { isStoreHost } from "@/lib/storeHost";

/* The agent dashboard lives on the main site. From a store host (custom domain or free subdomain) the link must
   be absolute; on the main site a relative path keeps the SPA navigation. */
export const DASHBOARD_URL = "https://datayego.com/agent";
export const dashboardHref = () => (isStoreHost() ? DASHBOARD_URL : "/agent");
