import { Outlet } from "react-router-dom";

/**
 * Content column for the app pages — shop, wallet, orders, account, AI
 * support, order tracking. Same max width and gutters as every marketing
 * page, so moving between the storefront and the account area never shifts
 * the layout. The chrome around it is the site's one header and footer.
 */
export default function AppPage() {
  return (
    <div className="mk-wrap pb-16 pt-8 sm:pt-10 lg:pb-24 lg:pt-12">
      <Outlet />
    </div>
  );
}
