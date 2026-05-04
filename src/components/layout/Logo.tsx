const LOGO_SRC = '/yiego-logo.png';

interface LogoProps {
  className?: string;
  height?: string;
  loading?: 'eager' | 'lazy';
}

/**
 * YieGo header/main logo.
 * Use anywhere a full wordmark is needed (navbar, footer, auth, dashboard header).
 */
const Logo = ({ className = '', height = 'h-9', loading = 'eager' }: LogoProps) => {
  return (
    <img
      src={LOGO_SRC}
      alt="YieGo — Your everyday digital plug"
      className={`${height} w-auto object-contain animate-[logo-fade_200ms_ease-out] ${className}`}
      loading={loading}
    />
  );
};

export default Logo;
