import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Settings, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { toast } from 'sonner';
import Logo from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

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
  const initials = (profile?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase();

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
                <div className="absolute right-0 top-12 z-50 bg-card rounded-xl border border-border card-shadow-elevated w-56 py-1.5 animate-page-in">
                  <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 ring-2 ring-border">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full gradient-gold flex items-center justify-center text-primary-foreground font-bold text-sm">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{profile?.full_name || 'User'}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link to="/dashboard/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors duration-150">
                      <User className="w-4 h-4" /> Profile
                    </Link>
                    <Link to="/dashboard/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors duration-150">
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                    {(isAdmin || isStaff) && (
                      <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors duration-150">
                        <Shield className="w-4 h-4" /> Admin Panel
                      </Link>
                    )}
                  </div>
                  <div className="border-t border-border pt-1">
                    <button onClick={() => { setMenuOpen(false); handleSignOut(); }} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors duration-150 w-full text-left">
                      <LogOut className="w-4 h-4" /> Sign Out
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
