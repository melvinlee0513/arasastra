import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, amount } = await req.json();

    if (!userId || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing userId or amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", userId)
      .single();

    if (!profile || !profile.email) {
      return new Response(
        JSON.stringify({ error: "User profile not found or no email" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Lovable AI Gateway to generate the receipt HTML
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Fallback: create a simple receipt without AI
      console.log(`Receipt email would be sent to ${profile.email} for RM${amount}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: `Receipt prepared for ${profile.email}`,
          receipt: {
            to: profile.email,
            name: profile.full_name,
            amount: `RM${amount}`,
            date: new Date().toISOString(),
            status: "Payment Approved - Access Granted",
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate formatted receipt with AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: "Generate a clean HTML email receipt. Return ONLY the HTML, no markdown. Use inline styles. Brand: Arasa A+. Colors: #1a1b3a (navy), #FFD700 (gold accent).",
          },
          {
            role: "user",
            content: `Create an HTML receipt email for:
- Student: ${profile.full_name}
- Amount: RM${amount}
- Date: ${new Date().toLocaleDateString("en-MY")}
- Status: Payment Received ✅ Access Granted
- Note: Your learning dashboard is now fully unlocked.`,
          },
        ],
        max_tokens: 1000,
      }),
    });

    const aiData = await aiResponse.json();
    const receiptHtml = aiData.choices?.[0]?.message?.content || "<p>Payment of RM" + amount + " received. Access granted.</p>";

    return new Response(
      JSON.stringify({
        success: true,
        receipt: {
          to: profile.email,
          name: profile.full_name,
          amount: `RM${amount}`,
          html: receiptHtml,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
