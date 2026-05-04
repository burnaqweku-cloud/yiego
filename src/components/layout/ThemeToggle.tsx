import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Premium pill-style theme toggle with animated icon swap.
 */
export function ThemeToggle({ className = '', size = 'md' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const dim = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`${dim} relative rounded-full border border-border/70 bg-card/70 backdrop-blur-md text-foreground/70 hover:text-foreground hover:border-primary/40 transition-all duration-200 flex items-center justify-center overflow-hidden group ${className}`}
    >
      <Sun
        className={`absolute w-4 h-4 transition-all duration-300 ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-45 scale-75'}`}
      />
      <Moon
        className={`absolute w-4 h-4 transition-all duration-300 ${isDark ? 'opacity-0 rotate-45 scale-75' : 'opacity-100 rotate-0 scale-100'}`}
      />
    </button>
  );
}
