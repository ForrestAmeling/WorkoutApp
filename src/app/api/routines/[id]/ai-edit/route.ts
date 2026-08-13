import { findLibraryByName, loadExerciseLibrary } from "@/lib/exercise-library";
import {
  defaultTargetsForFocus,
  fociForMode,
  modeLabel,
  normalizeFocusTarget,
  parsePeriodizationMode,
  promptAsksForSetRepChanges,
  type PeriodizationMode,
} from "@/lib/periodization";
import { createClient } from "@/lib/supabase/server";
import {
  loadRoutineEditor,
  replaceRoutineContent,
  type EditorDay,
} from "@/lib/routines";
import type { RoutineDayInput, WeekFocus } from "@/lib/types";
import { NextResponse } from "next/server";

type Props = { params: Promise<{ id: string }> };

type AiTargets = Partial<
  Record<WeekFocus, { sets?: number; rep_low?: number; rep_high?: number }>
>;

type AiDay = {
  name?: string;
  exercises?: {
    name?: string;
    sets?: number;
    rep_low?: number;
    rep_high?: number;
    targets?: AiTargets;
  }[];
};

function formatTargets(ex: EditorDay["exercises"][number]) {
  const parts = (["light", "middle", "heavy"] as WeekFocus[])
    .map((focus) => {
      const t = ex.targets.find((x) => x.week_focus === focus);
      if (!t) return null;
      return `${focus}: ${t.target_sets}x${t.rep_low}-${t.rep_high}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join("; ") : "no targets";
}

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const prompt = String(body.prompt ?? "").trim();
  const apply = body.apply !== false;
  const modeOverride = parsePeriodizationMode(body.periodization_mode);

  if (prompt.length < 4) {
    return NextResponse.json(
      { error: "Describe what you want to change." },
      { status: 400 }
    );
  }

  const loaded = await loadRoutineEditor(supabase, id);
  if (!loaded || loaded.routine.user_id !== user.id) {
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  }

  const mode: PeriodizationMode =
    modeOverride ??
    parsePeriodizationMode(loaded.routine.periodization_mode) ??
    (loaded.routine.uses_periodization ? "full" : "none");

  const changeSetsReps = promptAsksForSetRepChanges(prompt);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const currentSummary = loaded.days
    .map((d) => {
      const exs = d.exercises
        .map((e, idx) => `  ${idx + 1}. ${e.name} — ${formatTargets(e)}`)
        .join("\n");
      return `${d.name}:\n${exs || "  (empty)"}`;
    })
    .join("\n\n");

  const library = await loadExerciseLibrary();
  const sampleNames = library
    .filter((e) => (e.equipment ?? "").toLowerCase().includes("dumbbell"))
    .slice(0, 30)
    .map((e) => e.name);

  const periodizationRules =
    mode === "full"
      ? `Periodization is FULL (Light / Middle / Heavy). Required target bands:
- light:  ~3 sets × 20–25 reps (higher reps than middle)
- middle: ~3 sets × 8–12 reps (keep this band)
- heavy:  ~4 sets × 4–6 reps (lower reps)
Never collapse all three focuses to the same sets/reps.`
      : `Periodization mode: ${modeLabel(mode)} (${mode}).`;

  const preserveRules = changeSetsReps
    ? `The user IS asking to change sets/reps. Update targets, but keep clear Light/Middle/Heavy variance as above.`
    : `CRITICAL: The user is NOT asking to change sets/reps (e.g. equipment/home/gym swap only).
You MUST copy each exercise's existing light/middle/heavy targets EXACTLY into the response.
Only change exercise names / equipment selection. Do not invent new set/rep numbers.`;

  const system = `You edit an existing workout routine. Return ONLY valid JSON:
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
          "targets": {
            "light":  { "sets": number, "rep_low": number, "rep_high": number },
            "middle": { "sets": number, "rep_low": number, "rep_high": number },
            "heavy":  { "sets": number, "rep_low": number, "rep_high": number }
          }
        }
      ]
    }
  ]
}
Rules:
- Keep the same number of days unless the user asks to add/remove days (2-7).
- Apply the user's requested changes; keep day structure when possible.
- ${periodizationRules}
- ${preserveRules}
- Prefer dumbbell / home-friendly names when asked for home workouts. Examples: ${sampleNames.join(", ")}
- No markdown.`;

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
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Current routine "${loaded.routine.name}":\n\n${currentSummary}\n\nRequested changes:\n${prompt}\n\n${
              changeSetsReps
                ? "Update set/rep targets as requested with proper Light/Middle/Heavy variance."
                : "Preserve every light/middle/heavy set×rep target from the current routine."
            }`,
          },
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
    const parsed = JSON.parse(
      json.choices?.[0]?.message?.content ?? "{}"
    ) as {
      name?: string;
      description?: string;
      days?: AiDay[];
    };

    const foci = fociForMode(mode);
    const days: RoutineDayInput[] = [];
    const rawDays = (parsed.days ?? []).slice(0, 7);

    for (let i = 0; i < rawDays.length; i++) {
      const d = rawDays[i];
      const originalDay = loaded.days[i];
      const exercises = [];

      for (let j = 0; j < (d.exercises ?? []).length; j++) {
        const ex = d.exercises![j];
        const name = (ex.name ?? "").trim();
        if (!name) continue;
        const lib = await findLibraryByName(name);
        const originalEx = originalDay?.exercises[j];

        const targets: NonNullable<
          RoutineDayInput["exercises"][number]["targets"]
        > = {};

        for (const focus of foci) {
          if (!changeSetsReps && originalEx) {
            // Equipment/exercise swaps: keep prior periodization targets by slot
            const orig = originalEx.targets.find((t) => t.week_focus === focus);
            targets[focus] = orig
              ? {
                  target_sets: orig.target_sets,
                  rep_low: orig.rep_low,
                  rep_high: orig.rep_high,
                }
              : defaultTargetsForFocus(focus);
          } else {
            const aiT = ex.targets?.[focus];
            targets[focus] = normalizeFocusTarget(focus, {
              sets: aiT?.sets ?? (focus === foci[0] ? ex.sets : undefined),
              rep_low: aiT?.rep_low ?? (focus === foci[0] ? ex.rep_low : undefined),
              rep_high:
                aiT?.rep_high ?? (focus === foci[0] ? ex.rep_high : undefined),
            });
          }
        }

        // Extra safety for full cycle: never allow identical collapsed targets
        if (mode === "full" && changeSetsReps) {
          targets.light = normalizeFocusTarget("light", targets.light);
          targets.middle = normalizeFocusTarget("middle", targets.middle);
          targets.heavy = normalizeFocusTarget("heavy", targets.heavy);
        } else if (mode === "full" && !changeSetsReps) {
          // If somehow originals were already collapsed, repair variance
          const l = targets.light!;
          const m = targets.middle!;
          const h = targets.heavy!;
          const collapsed =
            l.rep_low === m.rep_low &&
            m.rep_low === h.rep_low &&
            l.rep_high === m.rep_high &&
            m.rep_high === h.rep_high;
          if (collapsed) {
            targets.light = defaultTargetsForFocus("light");
            targets.middle = defaultTargetsForFocus("middle");
            targets.heavy = defaultTargetsForFocus("heavy");
          }
        }

        const primary = targets[foci[0]] ?? defaultTargetsForFocus(foci[0]);
        exercises.push({
          name: lib?.name ?? name,
          library_id: lib?.id ?? null,
          image_url: lib?.imageUrl ?? null,
          muscle_group: lib?.primaryMuscles[0] ?? null,
          target_sets: primary.target_sets,
          rep_low: primary.rep_low,
          rep_high: primary.rep_high,
          targets,
        });
      }

      if (!exercises.length) continue;
      days.push({
        day_number: i + 1,
        name:
          (d.name ?? originalDay?.name ?? `Day ${i + 1}`).trim() ||
          `Day ${i + 1}`,
        exercises,
      });
    }

    days.forEach((d, i) => {
      d.day_number = i + 1;
    });

    if (!days.length) {
      return NextResponse.json(
        { error: "AI returned no usable days." },
        { status: 422 }
      );
    }

    if (!apply) {
      return NextResponse.json({
        name: parsed.name?.trim() || loaded.routine.name,
        description: parsed.description ?? loaded.routine.description,
        periodization_mode: mode,
        days,
        preserved_targets: !changeSetsReps,
      });
    }

    const updated = await replaceRoutineContent(supabase, user.id, id, {
      name: parsed.name?.trim() || loaded.routine.name,
      description: parsed.description ?? loaded.routine.description,
      periodization_mode: mode,
      days,
    });

    return NextResponse.json({
      routine: updated.routine,
      days: updated.days,
      preserved_targets: !changeSetsReps,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI edit failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
