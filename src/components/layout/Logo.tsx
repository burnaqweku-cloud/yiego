import { useTheme } from '@/contexts/ThemeContext';

const LIGHT_LOGO = '/yiego-logo.png';
const DARK_LOGO = '/yiego-logo.png';

interface LogoProps {
  className?: string;
  height?: string;
  loading?: 'eager' | 'lazy';
}

/**
 * Theme-aware YieGo logo.
 * Shows dark-text logo in light mode, light-text logo in dark mode.
 * Smooth crossfade transition on theme toggle.
 */
const Logo = ({ className = '', height = 'h-9', loading = 'eager' }: LogoProps) => {
  const { theme } = useTheme();
  const src = theme === 'dark' ? DARK_LOGO : LIGHT_LOGO;

  return (
    <img
      key={theme}
      src={src}
      alt="YieGo"
      className={`${height} w-auto object-contain animate-[logo-fade_200ms_ease-out] ${className}`}
      loading={loading}
    />
  );
};

export default Logo;
