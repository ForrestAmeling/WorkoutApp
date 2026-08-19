import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

/**
 * Set only by middleware (src/lib/supabase/middleware.ts), after it has
 * already verified the caller's session against Supabase Auth for this
 * exact request. Middleware strips any copy of this header off the
 * incoming request before setting its own value, so a client can never
 * forge it.
 */
export const VERIFIED_USER_HEADER = "x-verified-user";

export type VerifiedUser = {
  id: string;
  email?: string | null;
  created_at: string;
};

/**
 * Returns the user middleware already verified for this request, read back
 * out of the trusted header it set — this avoids a second, redundant
 * network round trip to Supabase Auth to re-check the exact same thing a
 * moment after middleware already did. Falls back to calling
 * supabase.auth.getUser() directly if the header is missing (e.g. this
 * ever runs somewhere middleware didn't reach), so correctness never
 * depends on the header being present.
 */
export async function getVerifiedUser(
  supabase: SupabaseClient
): Promise<VerifiedUser | null> {
  const h = await headers();
  const raw = h.get(VERIFIED_USER_HEADER);
  if (raw) {
    try {
      return JSON.parse(raw) as VerifiedUser;
    } catch {
      // Malformed header — fall through to the real check below.
    }
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null, created_at: user.created_at };
}
