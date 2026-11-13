import {
  customExerciseNameIndex,
  listVisibleCustomExercises,
} from "@/lib/custom-exercises";
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
import { billingApiError } from "@/lib/require-billing";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import {
  loadRoutineEditor,
  replaceRoutineContent,
  type EditorDay,
} from "@/lib/routines";
import type { RoutineDayInput, WeekFocus } from "@/lib/types";
import { matchOriginalExercise, replacedSlotExercise } from "@/lib/routine-edit";
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
  const user = await getVerifiedUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await billingApiError(user.id);
  if (denied) return denied;

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

  const [library, customRows] = await Promise.all([
    loadExerciseLibrary(),
    listVisibleCustomExercises(supabase).catch(() => []),
  ]);
  // Your own (and shared) exercises win over a free-exercise-db name match.
  const customByName = customExerciseNameIndex(customRows, user.id);
  const sampleNames = [
    // The user's own exercise names exactly, so the model can pick them.
    ...[...customByName.values()].map((e) => e.name),
    ...library
      .filter((e) => (e.equipment ?? "").toLowerCase().includes("dumbbell"))
      .slice(0, 30)
      .map((e) => e.name),
  ];

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

    // Match each exercise the AI sends back to the one it already was, so an
    // edit like "alternate farmer's walk and curls" leaves every other
    // exercise exactly as the user set it up. Same-day matches first for
    // every day, then anywhere in the routine (moved between days).
    const allOriginal = loaded.days.flatMap((d) => d.exercises);
    const claimed = new Set<string>();
    const dayNames = rawDays.map((d) =>
      (d.exercises ?? []).map((ex) => (ex.name ?? "").trim())
    );
    const matches = dayNames.map((names, i) =>
      names.map((name) =>
        name
          ? matchOriginalExercise(name, loaded.days[i]?.exercises ?? [], [], claimed)
          : null
      )
    );
    dayNames.forEach((names, i) =>
      names.forEach((name, j) => {
        if (name && !matches[i][j]) {
          matches[i][j] = matchOriginalExercise(name, [], allOriginal, claimed);
        }
      })
    );

    for (let i = 0; i < rawDays.length; i++) {
      const d = rawDays[i];
      const originalDay = loaded.days[i];
      const exercises: RoutineDayInput["exercises"] = [];

      for (let j = 0; j < (d.exercises ?? []).length; j++) {
        const ex = d.exercises![j];
        const name = dayNames[i][j];
        if (!name) continue;
        const original = matches[i][j];
        // Kept exercises keep their own targets; a new exercise that took a
        // dropped one's slot inherits that slot's targets.
        const targetSource =
          original ?? replacedSlotExercise(originalDay?.exercises[j], dayNames[i]);

        const targets: NonNullable<
          RoutineDayInput["exercises"][number]["targets"]
        > = {};

        for (const focus of foci) {
          if (!changeSetsReps && targetSource) {
            const orig = targetSource.targets.find((t) => t.week_focus === focus);
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
        if (original) {
          exercises.push({
            id: original.id,
            name: original.name,
            library_id: original.library_id,
            image_url: original.image_url,
            muscle_group: original.muscle_group,
            is_accessory: original.is_accessory,
            target_sets: primary.target_sets,
            rep_low: primary.rep_low,
            rep_high: primary.rep_high,
            targets,
          });
          continue;
        }
        const lib =
          customByName.get(name.toLowerCase()) ?? (await findLibraryByName(name));
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
