import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const LEGAL_SLUGS = new Set(["privacy", "terms", "refunds"]);

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Authentication required" }, { status: 401 });

    const supabase = createSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse({ error: "Invalid session" }, { status: 401 });

    const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", authData.user.id).eq("is_active", true).maybeSingle();
    if (!admin) return jsonResponse({ error: "Admin access required" }, { status: 403 });

    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "update_contact") {
      const businessName = String(body.businessName ?? "YieGo").trim().slice(0, 100);
      const whatsappNumber = String(body.whatsappNumber ?? "").replace(/[^0-9+]/g, "").slice(0, 20) || null;
      const whatsappMessage = String(body.whatsappMessage ?? "").trim().slice(0, 500);
      const supportEmail = String(body.supportEmail ?? "").trim().toLowerCase().slice(0, 254) || null;
      const businessHours = String(body.businessHours ?? "").trim().slice(0, 200) || null;
      const enabled = body.isWhatsappEnabled !== false;

      if (!businessName) return jsonResponse({ error: "Business name is required" }, { status: 400 });
      if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) return jsonResponse({ error: "Enter a valid support email" }, { status: 400 });
      if (enabled && !whatsappNumber) return jsonResponse({ error: "A WhatsApp number is required while WhatsApp support is enabled" }, { status: 400 });

      const { data, error } = await supabase.from("public_contact_settings").upsert({
        id: true,
        business_name: businessName,
        whatsapp_number: whatsappNumber,
        whatsapp_message: whatsappMessage || "Hello YieGo, I need help with an order.",
        support_email: supportEmail,
        business_hours: businessHours,
        is_whatsapp_enabled: enabled,
        updated_at: new Date().toISOString(),
        updated_by: authData.user.id,
      }).select("*").single();
      if (error) return jsonResponse({ error: error.message }, { status: 500 });
      return jsonResponse({ status: "success", data });
    }

    if (action === "update_legal") {
      const slug = String(body.slug ?? "");
      const title = String(body.title ?? "").trim().slice(0, 150);
      const summary = String(body.summary ?? "").trim().slice(0, 500);
      const content = String(body.content ?? "").trim();
      const published = body.isPublished !== false;
      if (!LEGAL_SLUGS.has(slug)) return jsonResponse({ error: "Unsupported legal document" }, { status: 400 });
      if (!title || content.length < 100) return jsonResponse({ error: "A title and complete policy content are required" }, { status: 400 });
      if (content.length > 100000) return jsonResponse({ error: "Policy content is too long" }, { status: 400 });

      const { data: current } = await supabase.from("legal_documents").select("version").eq("slug", slug).maybeSingle();
      const { data, error } = await supabase.from("legal_documents").upsert({
        slug,
        title,
        summary,
        content,
        version: Number(current?.version ?? 0) + 1,
        is_published: published,
        published_at: published ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        updated_by: authData.user.id,
      }).select("*").single();
      if (error) return jsonResponse({ error: error.message }, { status: 500 });
      return jsonResponse({ status: "success", data });
    }

    return jsonResponse({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
