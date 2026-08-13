import { createClient } from "@/lib/supabase/server";
import {
  buildDeepSeekPrompt,
  clampDelta,
  ruleBasedSuggestion,
  type HistorySet,
} from "@/lib/weight-suggestion";
import type { WeekFocus } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const exerciseId = body.exercise_id as string | undefined;
  const weekFocus = body.week_focus as WeekFocus | undefined;
  const repLow = Number(body.rep_low);
  const repHigh = Number(body.rep_high);

  if (
    !exerciseId ||
    !weekFocus ||
    !["light", "middle", "heavy"].includes(weekFocus) ||
    !Number.isFinite(repLow) ||
    !Number.isFinite(repHigh)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data: exercise } = await supabase
    .from("exercises")
    .select("name")
    .eq("id", exerciseId)
    .single();

  // History for this exercise + same week focus only (via sessions join)
  const { data: rows } = await supabase
    .from("set_logs")
    .select(
      `
      weight,
      reps,
      set_number,
      created_at,
      sessions!inner (
        week_focus,
        user_id
      )
    `
    )
    .eq("exercise_id", exerciseId)
    .eq("sessions.week_focus", weekFocus)
    .eq("sessions.user_id", user.id)
    .not("weight", "is", null)
    .not("reps", "is", null)
    .order("created_at", { ascending: false })
    .limit(12);

  const history: HistorySet[] = (rows ?? [])
    .filter((r) => r.weight != null && r.reps != null)
    .slice(0, 6)
    .map((r) => ({
      weight: Number(r.weight),
      reps: Number(r.reps),
      set_number: r.set_number,
    }));

  if (history.length === 0) {
    return NextResponse.json({
      suggested_weight: null,
      rationale: "No history for this exercise and week focus yet — enter weight manually.",
      source: "none",
    });
  }

  const fallback = ruleBasedSuggestion(history, repLow, repHigh)!;
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json(fallback);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: buildDeepSeekPrompt({
              exerciseName: exercise?.name ?? "Exercise",
              weekFocus,
              repLow,
              repHigh,
              history,
            }),
          },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(fallback);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as {
      suggested_weight?: number;
      rationale?: string;
    };

    const lastWeight = history[0].weight;
    const suggested = clampDelta(Number(parsed.suggested_weight), lastWeight);

    if (!Number.isFinite(suggested) || suggested <= 0) {
      return NextResponse.json(fallback);
    }

    return NextResponse.json({
      suggested_weight: suggested,
      rationale: parsed.rationale || fallback.rationale,
      source: "ai",
    });
  } catch {
    return NextResponse.json(fallback);
  }
}
