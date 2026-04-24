import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ logs: [], warning: "Няма активна сесия." });
    }

    const { data, error } = await supabase
      .from("execution_logs")
      .select("id, platform, campaign_name, action_taken, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      if ((error as { code?: string }).code === "42P01") {
        return NextResponse.json({
          logs: [],
          warning: "Лог таблицата още не е създадена. Изпълни SQL миграцията за execution_logs."
        });
      }
      return NextResponse.json({ logs: [], warning: "Неуспешно зареждане на логовете." });
    }

    return NextResponse.json({ logs: data ?? [] });
  } catch {
    return NextResponse.json({ logs: [], warning: "Временен проблем при зареждане на историята." });
  }
}
