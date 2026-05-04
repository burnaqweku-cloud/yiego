import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { sessionId, email } = await req.json();

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(JSON.stringify({ error: "sessionId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from("ai_conversations")
      .select("id, session_id, handled_by, admin_handler_name, user_email, updated_at")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (conversationError) throw conversationError;

    if (!conversation) {
      return new Response(JSON.stringify({ conversation: null, messages: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      email &&
      conversation.user_email &&
      conversation.user_email.toLowerCase() !== String(email).toLowerCase()
    ) {
      return new Response(JSON.stringify({ error: "Conversation access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("ai_conversation_messages")
      .select("id, conversation_id, role, content, image_url, event_type, admin_name, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(250);

    if (messagesError) throw messagesError;

    return new Response(JSON.stringify({ conversation, messages: messages || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("support-conversation-sync error:", error);

    return new Response(JSON.stringify({ error: "Failed to sync conversation" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});