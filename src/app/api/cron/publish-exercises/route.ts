import { NextResponse } from "next/server";
import { githubLogin } from "@/lib/github-pr";
import { publishApproved, syncSubmissions } from "@/lib/publish-exercises";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Daily: record what free-exercise-db did with earlier PRs, then send
 * approved exercises as one PR when 10 are waiting or two weeks have
 * passed since the last one (see shouldOpenPr).
 */
export async function GET(request: Request) {
  // Unlike keep-alive, this acts on GitHub under the owner's account, so
  // it never runs without the secret (preview deployments don't have one).
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GITHUB_PUBLISH_TOKEN;
  if (!token) {
    return NextResponse.json({ skipped: "GITHUB_PUBLISH_TOKEN is not set" });
  }

  try {
    // Checked every run, even with nothing to send, so an expired token
    // shows up as a failed cron in Vercel instead of silently stalling.
    await githubLogin(token);
    const admin = createAdminClient();
    const synced = await syncSubmissions(admin, token);
    const published = await publishApproved(admin, token);
    return NextResponse.json({ ok: true, synced, published });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Publish failed";
    console.error("free-exercise-db publish failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
