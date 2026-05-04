import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AppBanner from './AppBanner';
import { ThemeToggle } from './ThemeToggle';
import Logo from './Logo';
import AnimatedBackground from './AnimatedBackground';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

/**
 * Dedicated auth layout — no navbar/footer.
 * Full-height centered, gold glow behind logo, theme toggle top-right.
 */
const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col relative bg-background">
      <AnimatedBackground />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* App banner (mobile only) */}
        <AppBanner />

        {/* Theme toggle — fixed top-right */}
        <div className="absolute top-3 right-4 z-20">
          <ThemeToggle size="md" />
        </div>

        {/* Main content — vertically centered */}
        <div className="flex-1 flex items-start md:items-center justify-center px-4 py-8 md:py-12">
          <div className="w-full max-w-[420px]">
            {/* Logo with gold glow */}
            <div className="text-center mb-8 md:mb-10">
              <Link
                to="/"
                className="inline-block relative mb-5 md:mb-6"
                aria-label="DataSika Home"
              >
                {/* Gold radial glow behind logo */}
                <div
                  className="absolute inset-0 -m-8 rounded-full pointer-events-none opacity-0 dark:opacity-100 transition-opacity duration-300"
                  style={{
                    background: 'radial-gradient(ellipse at center, hsl(44 96% 52% / 0.12) 0%, hsl(44 96% 52% / 0.04) 50%, transparent 70%)',
                  }}
                />
                <Logo height="h-14 md:h-[4.2rem]" className="mx-auto relative z-10" />
              </Link>

              <h1 className="text-[1.35rem] md:text-2xl font-display font-extrabold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="text-muted-foreground text-[0.82rem] mt-1.5 leading-relaxed">
                {subtitle}
              </p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
