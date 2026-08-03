import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import SmartBackButton from "@/components/layout/SmartBackButton";

interface LegalRow { title: string; summary: string; content: string; version: number; published_at: string | null; }

export default function LegalDocument() {
  const { slug = "privacy" } = useParams();
  const [document, setDocument] = useState<LegalRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as unknown as { schema: (name: string) => any }).schema("phase1").from("legal_documents").select("title, summary, content, version, published_at").eq("slug", slug).eq("is_published", true).maybeSingle();
      setDocument(data as LegalRow | null);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>;
  if (!document) return <div className="space-y-5"><SmartBackButton fallback="/" /><Card><CardContent><h1 className="font-display text-2xl font-semibold text-white">Document unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This legal document is not currently published.</p></CardContent></Card></div>;

  return <div className="mx-auto max-w-4xl space-y-6">
    <SmartBackButton fallback="/" />
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-glow">Legal</p><h1 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">{document.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{document.summary}</p></div>
    <Card><CardContent><article className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{document.content}</article><div className="mt-8 border-t border-white/[0.08] pt-4 text-xs text-faint-foreground">Version {document.version}{document.published_at ? ` · Published ${new Date(document.published_at).toLocaleDateString("en-GH")}` : ""}</div></CardContent></Card>
  </div>;
}
