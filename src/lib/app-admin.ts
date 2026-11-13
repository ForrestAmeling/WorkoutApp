import type { SupabaseClient } from "@supabase/supabase-js";

/** App admins (rows in app_admins, added by hand) review free-exercise-db submissions. */
export async function isAppAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
