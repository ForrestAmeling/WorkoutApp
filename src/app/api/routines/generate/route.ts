import { findLibraryByName, loadExerciseLibrary } from "@/lib/exercise-library";
import {
  defaultTargetsForFocus,
  fociForMode,
  modeLabel,
  parsePeriodizationMode,
  type PeriodizationMode,
} from "@/lib/periodization";
import { createClient } from "@/lib/supabase/server";
import type { RoutineDayInput, WeekFocus } from "@/lib/types";
import { NextResponse } from "next/server";

type AiTargets = Partial<
  Record<WeekFocus, { sets?: number; rep_low?: number; rep_high?: number }>
>;

type AiDay = {
  name?: string;
  exercises?: {
    name?: string;
    library_id?: string;
    sets?: number;
    rep_low?: number;
    rep_high?: number;
    targets?: AiTargets;
  }[];
};

type AiRoutine = {
  name?: string;
  description?: string;
  days?: AiDay[];
};

function maxExercisesForMinutes(minutes: number) {
  if (minutes <= 25) return 3;
  if (minutes <= 35) return 4;
  if (minutes <= 45) return 5;
  if (minutes <= 60) return 6;
  return 7;
}

function parseMinutesFromText(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:min(?:ute)?s?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.min(120, Math.max(15, n)) : null;
}

function periodizationPromptBlock(mode: PeriodizationMode) {
  switch (mode) {
    case "full":
      return `Week focus mode: FULL CYCLE (Light → Middle → Heavy).
For EACH exercise include targets for all three focuses:
"targets": {
  "light":  { "sets": number, "rep_low": number, "rep_high": number },
  "middle": { "sets": number, "rep_low": number, "rep_high": number },
  "heavy":  { "sets": number, "rep_low": number, "rep_high": number }
}
Required target bands (do not collapse these):
- light:  ~3 sets × 20–25 reps
- middle: ~3 sets × 8–12 reps
- heavy:  ~4 sets × 4–6 reps
Adjust set count slightly for the time budget, but keep rep bands distinct.`;
    case "light":
      return `Week focus mode: LIGHT ONLY.
Program higher-rep work: typically 3 sets × 20–25 reps. Do NOT include middle/heavy variants.`;
    case "heavy":
      return `Week focus mode: HEAVY ONLY.
Program strength-focused lower reps: typically 4 sets × 4–6 reps. Prefer big compounds. Do NOT include light/middle variants.`;
    case "middle":
      return `Week focus mode: MIDDLE ONLY.
Program moderate hypertrophy: typically 3 sets × 8–12 reps. Do NOT include light/heavy variants.`;
    case "none":
    default:
      return `Week focus mode: NONE (fixed targets).
Use a single sets/rep_low/rep_high per exercise. No light/middle/heavy rotation.`;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const prompt = String(body.prompt ?? "").trim();
  const daysPerWeek = Math.min(7, Math.max(2, Number(body.days_per_week) || 4));
  const mode =
    parsePeriodizationMode(body.periodization_mode) ?? "none";
  const minutesFromBody = Number(body.minutes_per_session);
  const minutes =
    Number.isFinite(minutesFromBody) && minutesFromBody > 0
      ? Math.min(120, Math.max(15, minutesFromBody))
      : parseMinutesFromText(prompt) ?? 45;
  const maxPerDay = maxExercisesForMinutes(minutes);

  if (prompt.length < 8) {
    return NextResponse.json(
      { error: "Describe the routine you want (at least a short sentence)." },
      { status: 400 }
    );
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const library = await loadExerciseLibrary();
  const sampleNames = library
    .filter((e) =>
      ["barbell", "dumbbell", "cable", "machine", "body only"].includes(
        (e.equipment ?? "").toLowerCase()
      )
    )
    .slice(0, 80)
    .map((e) => e.name);

  const splitHint =
    daysPerWeek <= 3
      ? "Prefer full-body or upper/lower style days that still stay short."
      : daysPerWeek === 4
        ? "Prefer Upper / Lower / Upper / Lower (or similar), not full-body every day."
        : "Prefer a body-part or push/pull/legs-style split across the week — not full-body every session.";

  const system = `You design practical gym routines that fit a real clock. Return ONLY valid JSON:
{
  "name": string,
  "description": string,
  "days": [
    {
      "name": string,
      "exercises": [
        {
          "name": string,
          "sets": number,
          "rep_low": number,
          "rep_high": number,
          "targets": { "light"?: object, "middle"?: object, "heavy"?: object }
        }
      ]
    }
  ]
}

Hard constraints:
- Exactly ${daysPerWeek} training days.
- Each session is about ${minutes} minutes. Budget ~7–8 minutes per exercise (including rest).
- At most ${maxPerDay} exercises per day (prefer ${Math.max(2, maxPerDay - 1)}–${maxPerDay}).
- Prefer compound lifts first; skip fluff if time is tight.

${periodizationPromptBlock(mode)}

Language rules:
- If the user says "full body" WITHOUT saying "every day" / "each session", interpret as whole-body coverage over the WEEK via a split. ${splitHint}
- Only program full-body every day if they explicitly ask for that.
- Name days by focus (Push/Pull/Legs/Upper/Lower), not all "Full Body".

Catalog names when possible: ${sampleNames.slice(0, 35).join(", ")}
No markdown.`;

  const userMessage = `Days per week: ${daysPerWeek}
Minutes per session: ${minutes}
Max exercises per day: ${maxPerDay}
Periodization: ${modeLabel(mode)} (${mode})

User goals / equipment / notes:
${prompt}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMessage },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: "DeepSeek request failed" },
        { status: 502 }
      );
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as AiRoutine;
    const rawDays = (parsed.days ?? []).slice(0, daysPerWeek);
    const foci = fociForMode(mode);

    const days: RoutineDayInput[] = [];
    for (let i = 0; i < rawDays.length; i++) {
      const d = rawDays[i];
      const exercises = [];
      for (const ex of (d.exercises ?? []).slice(0, maxPerDay)) {
        const name = (ex.name ?? "").trim();
        if (!name) continue;
        const lib =
          (ex.library_id
            ? library.find((l) => l.id === ex.library_id)
            : null) ?? (await findLibraryByName(name));

        const primaryFocus = foci[0];
        const primaryDefaults = defaultTargetsForFocus(primaryFocus);
        const primaryFromAi = ex.targets?.[primaryFocus];

        const target_sets = Math.min(
          6,
          Math.max(
            1,
            Number(primaryFromAi?.sets ?? ex.sets) || primaryDefaults.target_sets
          )
        );
        const rep_low = Math.min(
          30,
          Math.max(
            1,
            Number(primaryFromAi?.rep_low ?? ex.rep_low) ||
              primaryDefaults.rep_low
          )
        );
        const rep_high = Math.min(
          40,
          Math.max(
            1,
            Number(primaryFromAi?.rep_high ?? ex.rep_high) ||
              primaryDefaults.rep_high
          )
        );

        const targets: RoutineDayInput["exercises"][number]["targets"] = {};
        for (const focus of foci) {
          const t = ex.targets?.[focus];
          const dflt = defaultTargetsForFocus(focus);
          targets[focus] = {
            target_sets: Math.min(
              6,
              Math.max(1, Number(t?.sets) || (focus === primaryFocus ? target_sets : dflt.target_sets))
            ),
            rep_low: Math.min(
              30,
              Math.max(1, Number(t?.rep_low) || (focus === primaryFocus ? rep_low : dflt.rep_low))
            ),
            rep_high: Math.min(
              40,
              Math.max(1, Number(t?.rep_high) || (focus === primaryFocus ? rep_high : dflt.rep_high))
            ),
          };
        }

        exercises.push({
          name: lib?.name ?? name,
          library_id: lib?.id ?? null,
          image_url: lib?.imageUrl ?? null,
          muscle_group: lib?.primaryMuscles[0] ?? null,
          target_sets,
          rep_low,
          rep_high,
          targets,
        });
      }
      if (exercises.length === 0) continue;
      days.push({
        day_number: i + 1,
        name: (d.name ?? `Day ${i + 1}`).trim() || `Day ${i + 1}`,
        exercises,
      });
    }

    days.forEach((d, i) => {
      d.day_number = i + 1;
    });

    if (days.length === 0) {
      return NextResponse.json(
        { error: "AI returned no usable days. Try a clearer prompt." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      name: parsed.name?.trim() || "AI Routine",
      description:
        parsed.description?.trim() ||
        `${daysPerWeek} days · ~${minutes} min · ${modeLabel(mode)}`,
      periodization_mode: mode,
      days,
      meta: {
        minutes_per_session: minutes,
        max_exercises_per_day: maxPerDay,
        periodization_mode: mode,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
