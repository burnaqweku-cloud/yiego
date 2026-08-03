import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function SmartBackButton({ fallback = "/", label = "Back" }: { fallback?: string; label?: string }) {
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback, { replace: true });
  };

  return (
    <Button type="button" variant="ghost" onClick={goBack} className="w-fit">
      <ArrowLeft size={17} />
      {label}
    </Button>
  );
}
