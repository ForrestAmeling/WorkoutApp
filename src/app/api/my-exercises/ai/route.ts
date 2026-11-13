import {
  EXERCISE_CATEGORIES,
  EXERCISE_FORCES,
  EXERCISE_LEVELS,
  EXERCISE_MECHANICS,
  splitInstructions,
} from "@/lib/custom-exercises";
import {
  loadExerciseLibrary,
  uniqueEquipment,
  uniqueMuscles,
} from "@/lib/exercise-library";
import { billingApiError } from "@/lib/require-billing";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { NextResponse } from "next/server";

type AiResult = {
  instructions?: unknown;
  primary_muscles?: unknown;
  secondary_muscles?: unknown;
  equipment?: unknown;
  level?: unknown;
  force?: unknown;
  mechanic?: unknown;
  category?: unknown;
};

function oneOf(value: unknown, allowed: readonly string[]) {
  return typeof value === "string" && allowed.includes(value.toLowerCase())
    ? value.toLowerCase()
    : null;
}

function someOf(value: unknown, allowed: readonly string[]) {
  return Array.isArray(value)
    ? [...new Set(value.map((v) => oneOf(v, allowed)).filter(Boolean))].slice(0, 6)
    : [];
}

/**
 * "Write for me" drafts free-exercise-db style steps (plus muscles/equipment
 * etc.) from the name and whatever's filled in; "Clean up" rewrites the
 * user's own text into clear steps without changing what they meant. The
 * client only fills metadata fields that are still empty.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await billingApiError(user.id);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = body.mode === "cleanup" ? "cleanup" : "write";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const text =
    typeof body.instructions === "string" ? body.instructions.trim().slice(0, 4000) : "";

  if (mode === "write" && !name) {
    return NextResponse.json({ error: "Name the exercise first." }, { status: 400 });
  }
  if (mode === "cleanup" && text.length < 10) {
    return NextResponse.json(
      { error: "Write a few words first, then clean them up." },
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

  const library = await loadExerciseLibrary().catch(() => []);
  const muscles = uniqueMuscles(library);
  const equipment = uniqueEquipment(library);

  const known = [
    `Name: ${name || "(not given)"}`,
    body.equipment ? `Equipment: ${String(body.equipment)}` : null,
    Array.isArray(body.primary_muscles) && body.primary_muscles.length
      ? `Primary muscles: ${body.primary_muscles.join(", ")}`
      : null,
    body.level ? `Level: ${String(body.level)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const task =
    mode === "write"
      ? `Write step-by-step instructions for this exercise in the style of free-exercise-db: 3 to 8 steps, each one or two plain sentences, covering setup, the movement, breathing where relevant, and the return. Include a short safety cue only if the movement needs one.${
          text ? `\nThe user's rough notes (use them, keep their intent):\n${text}` : ""
        }`
      : `Clean up the user's instructions below. Fix spelling and grammar, split them into clear ordered steps (each one or two plain sentences), and remove repetition. Keep their meaning, cues and order — do not add new technique advice.\n\nUser's text:\n${text}`;

  const system = `You help people document gym exercises. Return ONLY valid JSON:
{
  "instructions": string[],
  "primary_muscles": string[],
  "secondary_muscles": string[],
  "equipment": string | null,
  "level": string | null,
  "force": string | null,
  "mechanic": string | null,
  "category": string | null
}
Use only these values (lowercase):
- muscles: ${muscles.join(", ")}
- equipment: ${equipment.join(", ")}
- level: ${EXERCISE_LEVELS.join(", ")}
- force: ${EXERCISE_FORCES.join(", ")}
- mechanic: ${EXERCISE_MECHANICS.join(", ")}
- category: ${EXERCISE_CATEGORIES.join(", ")}
Use null or [] when unsure. Steps must not be numbered. No markdown.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: mode === "cleanup" ? 0.2 : 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${known}\n\n${task}` },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as AiResult;

    const steps = (Array.isArray(parsed.instructions) ? parsed.instructions : [])
      .flatMap((s) => (typeof s === "string" ? splitInstructions(s) : []))
      .slice(0, 20);
    if (steps.length === 0) {
      return NextResponse.json({ error: "AI returned no steps." }, { status: 422 });
    }

    const primary = someOf(parsed.primary_muscles, muscles);
    return NextResponse.json({
      instructions: steps,
      suggestions: {
        primary_muscles: primary,
        secondary_muscles: someOf(parsed.secondary_muscles, muscles).filter(
          (m) => !primary.includes(m)
        ),
        equipment: oneOf(parsed.equipment, equipment),
        level: oneOf(parsed.level, EXERCISE_LEVELS),
        force: oneOf(parsed.force, EXERCISE_FORCES),
        mechanic: oneOf(parsed.mechanic, EXERCISE_MECHANICS),
        category: oneOf(parsed.category, EXERCISE_CATEGORIES),
      },
    });
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
