import { EXERCISE_IMAGE_BUCKET } from "@/lib/custom-exercises";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Props = { params: Promise<{ path: string[] }> };

const SIGNED_SECONDS = 60 * 60;

/**
 * Exercise photos live in a private bucket. Signing as the viewer means the
 * storage policies decide access: your own photos, plus photos of any
 * exercise someone has shared. Anything else (signed out, unshared,
 * deleted) gets the default icon instead of a broken image.
 */
export async function GET(request: Request, { params }: Props) {
  const { path } = await params;
  const fallback = NextResponse.redirect(new URL("/icon-192.png", request.url));
  fallback.headers.set("Cache-Control", "no-store");

  // Paths ending in .jpg are excluded from middleware (see its matcher),
  // so the x-verified-user header was never set or sanitized here — ask
  // Supabase Auth directly instead of using getVerifiedUser.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || path.length !== 2) return fallback;

  const { data, error } = await supabase.storage
    .from(EXERCISE_IMAGE_BUCKET)
    .createSignedUrl(path.join("/"), SIGNED_SECONDS);
  if (error || !data?.signedUrl) return fallback;

  const res = NextResponse.redirect(data.signedUrl);
  // Slightly shorter than the signature so a cached redirect never points
  // at an expired URL.
  res.headers.set("Cache-Control", `private, max-age=${SIGNED_SECONDS - 300}`);
  return res;
}
