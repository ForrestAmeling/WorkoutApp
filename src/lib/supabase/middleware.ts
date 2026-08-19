import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VERIFIED_USER_HEADER, type VerifiedUser } from "./verified-user";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicRoute =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/flyer") ||
    path === "/api/stripe/webhook";

  if (!user && !isPublicRoute && path !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    return NextResponse.redirect(url);
  }

  // Forward the user Supabase's Auth server just verified for this exact
  // request to Server Components / Route Handlers via a request header, so
  // requireBillingPage() and every API route don't each pay for their own
  // redundant supabase.auth.getUser() network round trip a moment later to
  // re-check the exact same thing (see getVerifiedUser). Strip any
  // client-supplied copy first — only middleware may set this header — so
  // it can never be spoofed.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete(VERIFIED_USER_HEADER);
  if (user) {
    const verified: VerifiedUser = {
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at,
    };
    forwardedHeaders.set(VERIFIED_USER_HEADER, JSON.stringify(verified));
  }
  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  // Carry over any cookies staged onto supabaseResponse (e.g. a refreshed
  // session token) so they still reach the browser.
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}
