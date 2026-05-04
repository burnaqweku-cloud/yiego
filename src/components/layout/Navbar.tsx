import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, User, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import Logo from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/buy-data', label: 'Buy Data' },
  { to: '/track-order', label: 'Track Order' },
  { to: '/faq', label: 'FAQ' },
  { to: '/support', label: 'Support' },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
    navigate('/');
    setIsOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-card/90 backdrop-blur-md border-b border-border/80">
      <nav className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center group shrink-0">
          <Logo height="h-9 sm:h-10" className="transition-transform duration-200 group-hover:scale-[1.02]" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-0.5">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                location.pathname === link.to
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle size="sm" />
          {user ? (
            <>
              <Link to="/dashboard">
                <Button size="sm" className="btn-press gap-1.5 font-bold">
                  <User className="w-3.5 h-3.5" />
                  Dashboard
                </Button>
              </Link>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outline" size="sm" className="btn-press gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Admin
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="sm" className="btn-press gap-1.5 text-muted-foreground" onClick={handleSignOut}>
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="btn-press font-medium">Log In</Button>
              </Link>
              <Link to="/auth?tab=signup">
                <Button size="sm" className="btn-press font-bold">Sign Up</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile right: theme toggle + hamburger */}
        <div className="md:hidden flex items-center gap-1">
          <ThemeToggle size="sm" />
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile nav */}
      {isOpen && (
        <div className="md:hidden border-t border-border bg-card/98 backdrop-blur-md animate-page-in">
          <div className="container py-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setIsOpen(false)}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  location.pathname === link.to
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-border">
              {user ? (
                <>
                  <Link to="/dashboard" onClick={() => setIsOpen(false)}>
                    <Button className="w-full btn-press gap-1.5 font-bold" size="sm">
                      <User className="w-3.5 h-3.5" />
                      My Dashboard
                    </Button>
                  </Link>
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setIsOpen(false)}>
                      <Button variant="outline" className="w-full btn-press gap-1.5" size="sm">
                        <Shield className="w-3.5 h-3.5" />
                        Admin
                      </Button>
                    </Link>
                  )}
                  <Button variant="ghost" className="w-full btn-press gap-1.5 text-muted-foreground" size="sm" onClick={handleSignOut}>
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Link to="/auth" className="flex-1" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full btn-press" size="sm">Log In</Button>
                  </Link>
                  <Link to="/auth?tab=signup" className="flex-1" onClick={() => setIsOpen(false)}>
                    <Button className="w-full btn-press font-bold" size="sm">Sign Up</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
