/**
 * Onyx switch — an accessible toggle with a 44px hit target.
 * Emerald (the brand gradient) when on, quiet glass when off.
 */
export default function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex h-11 min-w-[48px] shrink-0 items-center justify-end rounded-full"
    >
      <span
        aria-hidden="true"
        className={`flex h-[28px] w-[46px] items-center rounded-full border p-[3px] transition-colors duration-200 ${
          on
            ? "border-primary-glow/40 bg-gradient-to-b from-[#7cf0b4] to-[#22c387] shadow-[0_6px_18px_-6px_rgba(34,195,135,0.7)]"
            : "border-white/10 bg-white/[0.06]"
        }`}
      >
        <span
          className={`h-[20px] w-[20px] rounded-full transition-transform duration-200 ${
            on ? "translate-x-[18px] bg-[#04120c]" : "translate-x-0 bg-[#8a988f]"
          }`}
        />
      </span>
    </button>
  );
}
