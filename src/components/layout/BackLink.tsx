import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/** A small "Back" at the top of inner public pages: history when there is some, the home page otherwise. */
export default function BackLink({ fallback = "/", label = "Back", className = "" }: { fallback?: string; label?: string; className?: string }) {
  const navigate = useNavigate();
  const goBack = () => { if (window.history.length > 1) navigate(-1); else navigate(fallback, { replace: true }); };
  return (
    <button type="button" onClick={goBack} className={`inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground ${className}`}>
      <ArrowLeft size={15} aria-hidden="true" />
      {label}
    </button>
  );
}
