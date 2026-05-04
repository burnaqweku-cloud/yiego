import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MessageCircle, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ConnectTelegram() {
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string>("datasika_bot");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-create-link-token");
      if (error) throw error;
      setLink(data.link);
      setBotUsername(data.bot_username || "datasika_bot");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Connect Telegram | DataSika";
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="container max-w-2xl mx-auto px-4 py-8">
          <Link to="/dashboard/settings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Settings
          </Link>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Connect Telegram</CardTitle>
                  <CardDescription>Link your DataSika account to @{botUsername}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertDescription>
                  Once connected, your Telegram order history and wallet balance will be unified with your DataSika web account.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm">How it works</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Click the button below to open Telegram</li>
                  <li>Tap <strong>Start</strong> in the bot chat</li>
                  <li>Your account will be instantly linked</li>
                </ol>
              </div>

              {loading ? (
                <Button disabled className="w-full">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating link…
                </Button>
              ) : link ? (
                <div className="space-y-3">
                  <Button asChild className="w-full" size="lg">
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="w-4 h-4 mr-2" /> Open in Telegram
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </a>
                  </Button>

                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <code className="flex-1 text-xs truncate">{link}</code>
                    <Button size="icon" variant="ghost" onClick={copyLink}>
                      {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground text-center">
                    This link expires in 15 minutes. <button onClick={generate} className="underline hover:text-foreground">Generate a new one</button>
                  </p>
                </div>
              ) : (
                <Button onClick={generate} className="w-full">Try again</Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
