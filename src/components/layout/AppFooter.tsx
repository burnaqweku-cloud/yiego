import { Link } from "react-router-dom";

/** Slim footer for signed-in app pages — the full site map lives on the
 *  public site, so this stays out of the way. */
export default function AppFooter() {
  return (
    <footer className="mt-14 border-t border-white/[0.07] py-7 text-xs text-muted-foreground">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} YieGo. All rights reserved.</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legal and support">
          <Link className="transition-colors hover:text-foreground" to="/support">
            Support
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/faq">
            FAQ
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/legal/privacy">
            Privacy
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/legal/terms">
            Terms
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/legal/refunds">
            Refunds
          </Link>
        </nav>
      </div>
    </footer>
  );
}
