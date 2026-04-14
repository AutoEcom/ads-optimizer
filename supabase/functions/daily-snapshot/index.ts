// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (request) => {
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const incomingSecret = request.headers.get("x-cron-secret");
    if (!cronSecret || incomingSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get("PROJECT_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing env config" }), { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: users, error: usersError } = await adminClient.auth.admin.listUsers();
    if (usersError) {
      return new Response(JSON.stringify({ error: usersError.message }), { status: 500 });
    }

    const results: Array<{ userId: string; status: "ok" | "error"; message?: string }> = [];

    for (const user of users.users) {
      const { error } = await adminClient.rpc("capture_daily_snapshot_for_user", {
        p_user_id: user.id
      });

      if (error) {
        results.push({ userId: user.id, status: "error", message: error.message });
      } else {
        results.push({ userId: user.id, status: "ok" });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), {
      status: 500
    });
  }
});
