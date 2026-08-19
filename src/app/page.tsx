import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  redirect(user ? "/today" : "/login");
}
