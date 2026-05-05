import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Settings, Shield } from 'lucide-react';
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

  return (
    <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border/80">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo */}
        <Link to="/dashboard" className="flex items-center shrink-0">
          <Logo height="h-8 sm:h-9" />
        </Link>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          <ThemeToggle size="sm" />
          <button
            onClick={() => navigate('/dashboard/notifications')}
            className={`p-2 rounded-lg hover:bg-muted transition-colors duration-150 relative ${hasNewNotification ? 'animate-notif-pulse' : ''}`}
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-sm">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Profile menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center hover:opacity-90 transition-opacity btn-press ring-2 ring-border"
              aria-label="Profile menu"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profile?.full_name || 'Profile'}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full gradient-gold flex items-center justify-center text-primary-foreground font-bold text-sm">
                  {initials}
                </div>
              )}
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-12 z-50 bg-card rounded-2xl border border-border shadow-2xl w-72 overflow-hidden animate-page-in">
                  {/* Header block with gradient */}
                  <div className="relative p-4 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 ring-2 ring-primary/30">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full gradient-gold flex items-center justify-center text-primary-foreground font-bold">
                            {initials}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">{profile?.full_name || 'YieGo user'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">@{profile?.username || user?.email?.split('@')[0]}</p>
                      </div>
                    </div>
                    {(isAdmin || isStaff) && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary/15 text-primary border border-primary/25">
                        <Shield className="w-2.5 h-2.5" /> {isAdmin ? 'Admin' : 'Staff'}
                      </span>
                    )}
                  </div>

                  <div className="py-1.5">
                    <Link to="/dashboard/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors">
                      <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><User className="w-4 h-4" /></span>
                      <span className="font-medium">Profile</span>
                    </Link>
                    <Link to="/dashboard/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors">
                      <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Settings className="w-4 h-4" /></span>
                      <span className="font-medium">Settings</span>
                    </Link>
                    {(isAdmin || isStaff) && (
                      <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors">
                        <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center"><Shield className="w-4 h-4" /></span>
                        <span className="font-medium">Admin Panel</span>
                      </Link>
                    )}
                  </div>
                  <div className="border-t border-border">
                    <button onClick={() => { setMenuOpen(false); handleSignOut(); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors w-full text-left">
                      <span className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center"><LogOut className="w-4 h-4" /></span>
                      <span className="font-semibold">Sign Out</span>
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

export default DashboardHeader;
