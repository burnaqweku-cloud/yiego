import { useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface PasswordStrengthBarProps {
  password: string;
}

const getStrength = (pw: string) => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-zA-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  return score;
};

const labels: Record<number, { text: string; color: string; bg: string }> = {
  0: { text: 'Too short', color: 'text-muted-foreground', bg: 'bg-muted' },
  1: { text: 'Weak', color: 'text-destructive', bg: 'bg-destructive' },
  2: { text: 'Fair', color: 'text-orange-500', bg: 'bg-orange-500' },
  3: { text: 'Medium', color: 'text-yellow-500', bg: 'bg-yellow-500' },
  4: { text: 'Strong', color: 'text-green-500', bg: 'bg-green-500' },
  5: { text: 'Very Strong', color: 'text-green-600', bg: 'bg-green-600' },
};

const PasswordStrengthBar = ({ password }: PasswordStrengthBarProps) => {
  const score = useMemo(() => getStrength(password), [password]);
  const info = labels[score] || labels[0];

  const checks = [
    { ok: password.length >= 8, label: 'At least 8 characters' },
    { ok: /[a-zA-Z]/.test(password), label: 'Contains a letter' },
    { ok: /[\d\W_]/.test(password), label: 'Contains a number or symbol' },
  ];

  if (!password) return null;

  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-colors duration-200 ${i <= score ? info.bg : 'bg-muted'}`}
            />
          ))}
        </div>
        <span className={`text-[10px] font-semibold ${info.color} min-w-[70px] text-right`}>{info.text}</span>
      </div>
      {/* Hints */}
      <div className="space-y-1">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 text-xs">
            {c.ok ? (
              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
            ) : (
              <XCircle className="w-3 h-3 text-muted-foreground/40 shrink-0" />
            )}
            <span className={c.ok ? 'text-green-600 font-medium' : 'text-muted-foreground'}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export { getStrength };
export default PasswordStrengthBar;
