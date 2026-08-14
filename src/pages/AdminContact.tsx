import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Save } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase } from "@/lib/admin-data";

interface ContactRow {
  business_name: string;
  whatsapp_number: string | null;
  whatsapp_message: string;
  support_email: string | null;
  business_hours: string | null;
  is_whatsapp_enabled: boolean;
}

const empty: ContactRow = {
  business_name: "DataYego",
  whatsapp_number: "",
  whatsapp_message: "Hello DataYego, I need help with an order.",
  support_email: "",
  business_hours: "",
  is_whatsapp_enabled: true,
};

export default function AdminContact() {
  const [form, setForm] = useState<ContactRow>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await adminDatabase().from<ContactRow>("public_contact_settings").select("business_name, whatsapp_number, whatsapp_message, support_email, business_hours, is_whatsapp_enabled").limit(1);
      if (error) toast.error("Could not load contact information.");
      else if (data?.[0]) setForm(data[0]);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string }>("admin-site-content-action", {
      body: {
        action: "update_contact",
        businessName: form.business_name,
        whatsappNumber: form.whatsapp_number,
        whatsappMessage: form.whatsapp_message,
        supportEmail: form.support_email,
        businessHours: form.business_hours,
        isWhatsappEnabled: form.is_whatsapp_enabled,
      },
    });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Could not save contact information.");
    toast.success("Contact information updated everywhere.");
  };

  if (loading) return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Contacts" title="Contact information" description="Control the official support details displayed throughout DataYego." />
    <Card><CardContent>
      <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/[0.1] text-success"><MessageCircle size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">WhatsApp support</h2><p className="mt-1 text-sm text-muted-foreground">Customers will only see the details saved here. The number is converted into a secure WhatsApp link in the public interface.</p></div></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Business name</span><input className="onyx-field" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">WhatsApp number</span><input className="onyx-field" value={form.whatsapp_number ?? ""} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} placeholder="233XXXXXXXXX" /></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Support email (optional)</span><input className="onyx-field" value={form.support_email ?? ""} onChange={(e) => setForm({ ...form, support_email: e.target.value })} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Business hours (optional)</span><input className="onyx-field" value={form.business_hours ?? ""} onChange={(e) => setForm({ ...form, business_hours: e.target.value })} placeholder="Monday–Saturday, 8:00 AM–8:00 PM" /></label>
        <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Default WhatsApp message</span><textarea className="onyx-field min-h-28 resize-y" value={form.whatsapp_message} onChange={(e) => setForm({ ...form, whatsapp_message: e.target.value })} /></label>
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 md:col-span-2"><input type="checkbox" checked={form.is_whatsapp_enabled} onChange={(e) => setForm({ ...form, is_whatsapp_enabled: e.target.checked })} /><span><strong className="block text-sm text-white">Show WhatsApp support</strong><span className="text-xs text-muted-foreground">Turn this off to temporarily hide the public WhatsApp button.</span></span></label>
      </div>
      <Button className="mt-6" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save contact information</Button>
    </CardContent></Card>
  </div>;
}
