import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Clock3, LogOut, Search, Star, X, type LucideIcon } from "lucide-react";
import Wordmark from "@/components/brand/Wordmark";
import { cn } from "@/lib/utils";
import { ADMIN_GROUPS, ADMIN_PAGES, groupForPath, pageForPath, pushRecent, readPins, readRecent, searchPages, togglePin, type AdminPage } from "@/lib/admin-nav";
import { useAuth } from "@/store/auth-context";
import { useProfile } from "@/store/profile";

/* ═══════════════════════════════════════════════════════════════════════
   Admin sidebar — one quiet column.

   Structure, top to bottom: brand · who is signed in · find a page ·
   pinned · recent · the menu (two tiers, one group open) · back to site.
   No boxes around groups: a hairline rule separates the top block from
   the menu, and an indent guide-line shows which pages belong to a group.
   Only the active page is bright; everything else sits in grey.
   ═══════════════════════════════════════════════════════════════════════ */

interface Props { onNavigate?: () => void; onClose?: () => void; }

export default function AdminSidebar({ onNavigate, onClose }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, initials } = useProfile();
  const userId = user?.id ?? "anon";

  const [pins, setPins] = useState<string[]>(() => readPins(userId));
  const [recent, setRecent] = useState<string[]>(() => readRecent(userId));
  const [query, setQuery] = useState("");
  const activeGroup = groupForPath(location.pathname)?.id ?? "overview";
  const [openGroup, setOpenGroup] = useState(activeGroup);

  useEffect(() => { setOpenGroup(activeGroup); }, [activeGroup]);
  useEffect(() => { setPins(readPins(userId)); setRecent(readRecent(userId)); }, [userId]);
  useEffect(() => {
    const page = pageForPath(location.pathname);
    if (page) setRecent(pushRecent(userId, page.id));
  }, [location.pathname, userId]);

  const pinned = useMemo(() => pins.map((id) => ADMIN_PAGES.find((p) => p.id === id)).filter(Boolean) as AdminPage[], [pins]);
  const recentPages = useMemo(() => recent.filter((id) => !pins.includes(id)).map((id) => ADMIN_PAGES.find((p) => p.id === id)).filter(Boolean) as AdminPage[], [recent, pins]);
  const results = useMemo(() => searchPages(query), [query]);
  const isPinned = useCallback((id: string) => pins.includes(id), [pins]);
  const doTogglePin = (id: string) => setPins(togglePin(userId, id));

  const go = (page: AdminPage) => { setQuery(""); navigate(page.to); onNavigate?.(); };
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && results[0]) go(results[0]);
    if (e.key === "Escape") setQuery("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col text-[13.5px]">
      {/* Brand */}
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <NavLink to="/admin" onClick={onNavigate} aria-label="DataYego admin" className="flex flex-col gap-1">
          <Wordmark className="h-[22px]" />
          <span className="text-[11px] text-faint-foreground">Admin</span>
        </NavLink>
        {onClose && <button type="button" onClick={onClose} className="onyx-iconbtn -mr-1" aria-label="Close menu"><X size={18} /></button>}
      </div>

      {/* Signed in */}
      <div className="flex items-center gap-3 border-y border-white/[0.06] px-5 py-3.5">
        <span className="onyx-avatar h-9 w-9 text-xs">{initials}</span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-foreground">{profile.firstName} {profile.lastName}</p>
          <p className="text-[12px] text-faint-foreground">Administrator</p>
        </div>
      </div>

      {/* Scrolling area */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-4">
        {/* Find a page */}
        <label className="relative block px-2">
          <Search size={15} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-faint-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Find a page…"
            aria-label="Find a page"
            className="h-10 w-full rounded-full border border-white/[0.08] bg-white/[0.035] pl-9 pr-4 text-[13.5px] text-foreground placeholder:text-faint-foreground focus:border-primary/40 focus:outline-none"
          />
        </label>

        {query.trim() ? (
          <ul className="mt-2 px-2" aria-label="Search results">
            {results.length === 0 && <li className="px-2 py-3 text-[13px] text-faint-foreground">No page matches "{query.trim()}".</li>}
            {results.map((page, i) => (
              <li key={page.id}>
                <button type="button" onClick={() => go(page)} className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left", i === 0 ? "bg-white/[0.05] text-foreground" : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground")}>
                  <page.icon size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{page.label}</span>
                  {i === 0 && <kbd className="rounded-md border border-white/[0.1] px-1.5 text-[10px] text-faint-foreground">↵</kbd>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {/* Pinned */}
            <SectionLabel icon={Star} label="Pinned" />
            {pinned.length === 0 ? (
              <p className="mx-2 rounded-2xl border border-dashed border-white/[0.1] px-4 py-3.5 text-[13px] leading-6 text-faint-foreground">
                Tap the <Star size={13} className="inline -mt-0.5" /> on any page to keep your daily pages here.
              </p>
            ) : (
              <ul className="mt-1">{pinned.map((page) => <PageRow key={page.id} page={page} pinned onPin={() => doTogglePin(page.id)} onNavigate={onNavigate} flush />)}</ul>
            )}

            {/* Recent */}
            {recentPages.length > 0 && (
              <>
                <SectionLabel icon={Clock3} label="Recent" />
                <ul className="mt-1">{recentPages.map((page) => <PageRow key={page.id} page={page} pinned={isPinned(page.id)} onPin={() => doTogglePin(page.id)} onNavigate={onNavigate} flush />)}</ul>
              </>
            )}

            <div className="mx-2 my-4 border-t border-white/[0.07]" />

            {/* Menu */}
            <nav aria-label="Admin navigation">
              {ADMIN_GROUPS.map((group) => {
                const open = openGroup === group.id;
                const holdsActive = activeGroup === group.id;
                const single = group.pages.length === 1;
                const Icon = group.icon;

                // Single-page groups are just a link — no accordion for one child.
                if (single) {
                  const page = group.pages[0];
                  return (
                    <NavLink key={group.id} to={page.to} end={page.end} onClick={onNavigate} className={({ isActive }) => cn("mx-2 my-0.5 flex items-center gap-3 rounded-2xl py-2 pl-2 pr-3", isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {({ isActive }) => (<>
                        <GroupIcon icon={Icon} active={isActive} />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{group.label}</span>
                        {isActive && <span className="h-2 w-2 rounded-full bg-primary-glow" aria-hidden />}
                      </>)}
                    </NavLink>
                  );
                }

                return (
                  <div key={group.id} className="my-0.5">
                    <button type="button" onClick={() => setOpenGroup(open ? "" : group.id)} aria-expanded={open} className={cn("mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl py-2 pl-2 pr-3 text-left", open ? "bg-white/[0.04] text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      <GroupIcon icon={Icon} active={holdsActive} />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{group.label}</span>
                      {holdsActive && !open && <span className="h-2 w-2 rounded-full bg-primary-glow" aria-hidden />}
                      <ChevronDown size={16} className={cn("shrink-0 text-faint-foreground transition-transform", open && "rotate-180")} />
                    </button>
                    {open && (
                      <ul className="relative ml-[1.85rem] mt-1 border-l border-white/[0.09] pb-1 pl-2">
                        {group.pages.map((page) => <PageRow key={page.id} page={page} pinned={isPinned(page.id)} onPin={() => doTogglePin(page.id)} onNavigate={onNavigate} />)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </nav>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3.5">
        <NavLink to="/shop" onClick={onNavigate} className="flex items-center gap-2.5 text-[14px] text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Back to site</NavLink>
        <button type="button" onClick={() => void signOut().then(() => navigate("/", { replace: true }))} className="flex items-center gap-2 text-[13px] text-faint-foreground hover:text-danger" aria-label="Sign out"><LogOut size={15} />Sign out</button>
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return <p className="mt-5 mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-faint-foreground"><Icon size={13} />{label.toUpperCase()}</p>;
}

function GroupIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", active ? "bg-primary/[0.16] text-primary-glow" : "bg-white/[0.05] text-muted-foreground")}><Icon size={17} /></span>;
}

function PageRow({ page, pinned, onPin, onNavigate, flush }: { page: AdminPage; pinned: boolean; onPin: () => void; onNavigate?: () => void; flush?: boolean }) {
  return (
    <li className="flex items-center">
      <NavLink to={page.to} end={page.end} onClick={onNavigate} className={({ isActive }) => cn("flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 text-[14px]", flush ? "px-3" : "px-2.5", isActive ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
        <page.icon size={16} className="shrink-0 opacity-80" />
        <span className="truncate">{page.label}</span>
      </NavLink>
      <button type="button" onClick={onPin} aria-label={pinned ? `Unpin ${page.label}` : `Pin ${page.label}`} aria-pressed={pinned} className={cn("mr-1 shrink-0 rounded-lg p-1.5", pinned ? "text-primary-glow" : "text-faint-foreground/60 hover:text-muted-foreground")}>
        <Star size={15} fill={pinned ? "currentColor" : "none"} />
      </button>
    </li>
  );
}
