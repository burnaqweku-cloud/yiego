/* The agent dashboard is served on the main site AND on every store host (custom domain or free subdomain), so a
   sub-agent can stay on the parent's address. The link is therefore always relative to wherever the person is. */
export const dashboardHref = () => "/agent";
