import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Settings, Shield, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { toast } from 'sonner';
import Logo from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { getDisplayName, getUsernameDisplay, getInitials } from '@/lib/user-display';

const DashboardHeader = () => {
  const { user, profile, isAdmin, isStaff, signOut } = useAuth();
  const { unreadCount, hasNewNotification } = useNotifications();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  const avatarUrl = profile?.avatar_url;
  const displayName = getDisplayName(profile, user);
  const username = getUsernameDisplay(profile, user);
  const initials = getInitials(profile, user);
  const isPriv = isAdmin || isStaff;

  return (
    <header className="sticky top-0 z-40 no-glass bg-background/75 backdrop-blur-2xl backdrop-saturate-150">
      {/* Gradient hairline bottom edge */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="flex items-center justify-between h-16 px-4 sm:px-5">
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center shrink-0 group" aria-label="YieGo dashboard">
          <Logo height="h-8 sm:h-9" className="transition-transform duration-300 group-hover:scale-[1.04]" />
        </Link>

        {/* Right cluster — uniform 36px pill buttons */}
        <div className="flex items-center gap-1.5">
          <ThemeToggle size="md" />

          {/* Notifications */}
          <button
            onClick={() => navigate('/dashboard/notifications')}
            className={`w-9 h-9 relative rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-foreground/70 hover:text-foreground hover:border-primary/40 hover:bg-card transition-all duration-200 flex items-center justify-center ${hasNewNotification ? 'animate-notif-pulse' : ''}`}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9.5px] font-bold tabular flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--destructive)/0.55)] ring-2 ring-background">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Profile menu trigger */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="group relative w-9 h-9 rounded-full overflow-visible flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
              aria-label="Profile menu"
            >
              <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] p-[1.5px] shadow-[0_6px_18px_-6px_hsl(var(--primary)/0.55)]">
                <span className="block w-full h-full rounded-full overflow-hidden bg-card">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] text-primary-foreground font-display font-extrabold text-[12.5px] tracking-tight">
                      {initials}
                    </span>
                  )}
                </span>
              </span>
              {/* Presence dot */}
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-background" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-12 z-50 w-[280px] rounded-2xl border border-border/70 bg-popover/95 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_60px_-20px_hsl(var(--primary)/0.35),0_8px_24px_-8px_hsl(0_0%_0%/0.15)] overflow-hidden animate-page-in">
                  {/* gradient top edge */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

                  {/* Profile block */}
                  <div className="relative p-4 border-b border-border/60 bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent">
                    <div className="absolute -top-12 -right-8 w-32 h-32 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                    <div className="relative flex items-center gap-3">
                      <div className="relative w-12 h-12 shrink-0">
                        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] p-[1.5px] shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.5)]">
                          <span className="block w-full h-full rounded-full overflow-hidden bg-card">
                            {avatarUrl ? (
                              <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] text-primary-foreground font-display font-extrabold text-[15px]">
                                {initials}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-popover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-bold tracking-tight truncate leading-tight">{displayName}</p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {username ? `@${username}` : (user?.email || 'Set username in profile')}
                        </p>
                        {isPriv && (
                          <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/25">
                            <Shield className="w-2.5 h-2.5" /> {isAdmin ? 'Admin' : 'Staff'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="p-1.5">
                    <MenuLink to="/dashboard/profile" icon={User} label="Profile" onClick={() => setMenuOpen(false)} />
                    <MenuLink to="/dashboard/settings" icon={Settings} label="Settings" onClick={() => setMenuOpen(false)} />
                    {isPriv && (
                      <MenuLink to="/admin" icon={Shield} label="Admin Panel" onClick={() => setMenuOpen(false)} />
                    )}
                  </div>

                  {/* Sign out */}
                  <div className="border-t border-border/60 p-1.5">
                    <button
                      onClick={() => { setMenuOpen(false); handleSignOut(); }}
                      className="group w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-destructive/8 transition-colors text-left"
                    >
                      <span className="w-8 h-8 rounded-lg bg-destructive/10 ring-1 ring-destructive/20 text-destructive flex items-center justify-center group-hover:scale-105 transition-transform">
                        <LogOut className="w-4 h-4" />
                      </span>
                      <span className="text-[13px] font-semibold text-destructive">Sign out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

const MenuLink = ({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string;
  icon: typeof User;
  label: string;
  onClick: () => void;
}) => (
  <Link
    to={to}
    onClick={onClick}
    className="group flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-primary/[0.06] transition-colors"
  >
    <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 text-primary flex items-center justify-center shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)] group-hover:scale-105 group-hover:ring-primary/30 transition-all">
      <Icon className="w-4 h-4" strokeWidth={2} />
    </span>
    <span className="text-[13px] font-semibold tracking-tight">{label}</span>
  </Link>
);

export default DashboardHeader;
