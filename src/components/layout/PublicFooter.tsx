import { Link } from "react-router-dom";

export default function PublicFooter() {
  return <footer className="mt-12 border-t border-white/[0.07] py-7 text-xs text-muted-foreground">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p>© {new Date().getFullYear()} YieGo. All rights reserved.</p>
      <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Legal and support">
        <Link className="hover:text-foreground" to="/support">Support</Link>
        <Link className="hover:text-foreground" to="/legal/privacy">Privacy</Link>
        <Link className="hover:text-foreground" to="/legal/terms">Terms</Link>
        <Link className="hover:text-foreground" to="/legal/refunds">Refunds</Link>
      </nav>
    </div>
  </footer>;
}
