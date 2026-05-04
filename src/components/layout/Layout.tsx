import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import SiteNoticeBanner from './SiteNoticeBanner';
import AppBanner from './AppBanner';
import AnimatedBackground from './AnimatedBackground';
import PageTransition from './PageTransition';


interface LayoutProps {
  children: ReactNode;
}

const HIDE_FOOTER_PATHS = ['/auth', '/login', '/register', '/reset-password'];

const Layout = ({ children }: LayoutProps) => {
  const { pathname } = useLocation();
  const showFooter = !HIDE_FOOTER_PATHS.some((p) => pathname.startsWith(p));

  return (
    <div className="min-h-screen flex flex-col relative">
      <AnimatedBackground />
      <div className="relative z-10 flex flex-col min-h-screen">
        <AppBanner />
        <SiteNoticeBanner />
        <Navbar />
        <main className="flex-1">
          <PageTransition>
            {children}
          </PageTransition>
        </main>
        {showFooter && <Footer />}
      </div>
      
    </div>
  );
};

export default Layout;
