import { Download, Share } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAppOffer } from "@/lib/appInstall";

/* The strip at the very top of the site on phones: "Get the DataYego app".
   It stays until the visitor has the app (it never shows inside the app, once the site is on an
   iPhone home screen, or when Chrome reports the app installed). It scrolls away with the page. */
export default function AppBanner() {
  const { show, device } = useAppOffer();
  const { pathname } = useLocation();
  if (!show || pathname === "/app") return null;
  const iphone = device === "iphone";
  return (
    <Link to="/app" className="yg-appbar lg:hidden" aria-label={iphone ? "Add DataYego to your home screen" : "Download the DataYego app"}>
      <img src="/yiego-icon-192.png?v=3" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-[12px]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight text-foreground">DataYego</span>
        <span className="block truncate text-[12.5px] leading-snug text-muted-foreground">{iphone ? "Add the app to your home screen" : "Get the DataYego app"}</span>
      </span>
      <span className="yg-appbar-cta">{iphone ? <Share size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}{iphone ? "Install" : "Download"}</span>
    </Link>
  );
}
