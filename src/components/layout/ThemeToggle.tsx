import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function ThemeToggle({ className = '', size = 'md' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const btnSize = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';

  return (
    <button
      onClick={toggleTheme}
      className={`${btnSize} rounded-lg flex items-center justify-center transition-colors duration-150 hover:bg-muted text-muted-foreground hover:text-foreground ${className}`}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? (
        <Sun className={iconSize} />
      ) : (
        <Moon className={iconSize} />
      )}
    </button>
  );
}
