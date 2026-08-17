# Known Issues — Root Causes & Fixes

Investigated against the actual source in this repo (Next.js App Router + TypeScript, Supabase backend). Every root cause below cites the specific file/lines it's based on; each one was independently re-checked by opening those files again and confirming the code matches before being written up here.

**One repo-wide caveat that affects a couple of the fixes below:** there's no committed SQL migration for the core tables (`exercises`, `exercise_targets`, `sessions`, `set_logs`, `routines`, etc.) — only `seed.sql` (data, not schema) and two small incremental patches (`supabase/session-unique.sql`, `supabase/subscriptions.sql`), both marked "applied remotely via Supabase MCP." The live schema lives in the Supabase project, not in git. Where a fix needs a schema change, that's called out explicitly.

| # | Issue | Primary file(s) |
|---|---|---|
| 1 | Light/Middle/Heavy all default to Middle's reps | `src/components/NewRoutineForm.tsx`, `src/lib/routines.ts` |
| 2 | Can't select bodyweight for weight | `src/components/ExerciseCard.tsx`, `src/lib/exercise-library.ts` |
| 3 | Can't type a decimal weight | `src/components/ExerciseCard.tsx` |
| 4 | Can't edit a set after saving | `src/app/history/[id]/page.tsx`, `src/components/OfflineSync.tsx` |
| 5 | No history/suggestion on day 2 of a repeated workout | `src/app/api/suggest-weight/route.ts`, `src/lib/routines.ts` |
| 6 | Saving a set often fails, needs retry | `src/lib/offline-queue.ts`, `src/components/ExerciseCard.tsx` |
| 7 | "Today" from History opens the wrong day | `src/lib/workout.ts` |
| 8 | Bottom nav text too small / not centered | `src/components/AppShell.tsx` |

---

## 1. Light/Middle/Heavy all default to Middle's reps

**What's happening:** When you build a routine yourself and cycle through Light → Middle → Heavy, all three intensities end up with the same (Middle's) rep target instead of each getting its own.

**Root cause:** In `src/components/NewRoutineForm.tsx`, the function that adds a library exercise while building a routine (`addLibExercise`, ~lines 115–145) computes **one flat** `{target_sets, rep_low, rep_high}` from `defaultTargetsForFocus(...)` and only picks focus-specific defaults when the periodization mode is *exactly* `"light"`, `"heavy"`, or `"middle"`. For the default "full cycle" mode (Light → Middle → Heavy, which is what "building yourself" starts in), it falls through and uses the Middle defaults (3×8–12), storing them as flat fields — no per-focus map is built.

Downstream, `createRoutineFromDays` in `src/lib/routines.ts` (~lines 283–293) is supposed to build one `exercise_targets` row per focus using `custom = ex.targets?.[focus]`, falling back to focus-specific defaults only when `custom` is missing. But since `NewRoutineForm` never populates `ex.targets`, `custom` is always `undefined` — so *every* focus falls back to the same flat `target_sets`/`rep_low`/`rep_high` that were set in step one (Middle's values). All three `exercise_targets` rows end up identical.

This is confirmed by contrast: `RoutineEditor.tsx`'s `addExercise` (~lines 168–177) loops `defaultTargetsForFocus(focus)` per focus directly and does **not** have this bug — exercises added while *editing* an existing routine get correctly differentiated targets. Only the "build new routine from scratch" path is affected.

**The fix:** In `NewRoutineForm.tsx`'s `addLibExercise`, build a per-focus `targets` map — one `defaultTargetsForFocus(focus)` entry for each focus applicable to the chosen periodization mode — the same way `RoutineEditor.addExercise` already does, instead of computing one flat target set from a single focus. Once `ex.targets` is populated correctly, `createRoutineFromDays`'s existing per-focus lookup will resolve correctly on its own — no changes needed on that side.

**Confidence:** High (found and confirmed by direct code comparison against the working `RoutineEditor.tsx` case).

---

## 2. Can't select bodyweight for weight

**What's happening:** There's no way to mark a set/exercise as bodyweight instead of typing a number.

**Root cause:** This isn't a hidden or broken control — it was never built. The log-set form in `src/components/ExerciseCard.tsx` (~lines 527–555) renders only a numeric decimal input plus +/− steppers; there's no toggle/checkbox anywhere. Both save paths hard-require a number:
- `logSet()` (lines 204–208): `if (weight === "" || reps === "") { setError("Enter weight and reps"); return; }`
- `saveEdit()` (lines 269–273): identical guard.

`src/lib/types.ts`'s `Exercise` type has no `is_bodyweight`/`weight_type` field, and `src/lib/offline-queue.ts` (line 17) types queued weight as a non-nullable `number`, so the requirement is enforced end-to-end, including offline sync.

Interestingly, the app already has a bodyweight *signal* available and throws it away: the exercise-library picker exposes `equipment === "body only"` for calisthenics moves (used only for search filtering in `ExercisePicker.tsx`), but `libraryToExercisePatch()` in `src/lib/exercise-library.ts` (lines 141–148) copies only `{name, library_id, image_url, muscle_group}` from a picked library exercise — it drops `equipment` before it ever reaches your own exercise record. And on the display side, `formatWeight()` in `src/lib/units.ts` already renders a `null` weight as "—", so the data model and display layer are actually ready for a bodyweight set — nothing upstream ever produces that `null`.

**The fix:**
1. In `ExerciseCard.tsx`: add a `bodyweight` boolean toggle next to the weight label in both the log-set form (~line 527) and the edit-set form (~line 409). When active, hide/disable the numeric input and skip the weight-required half of the guards in `logSet()` (line 205) and `saveEdit()` (line 270).
2. Change the insert/update payloads (lines ~213–220 and ~281–287) to send `weight: bodyweight ? null : lb` instead of an always-coerced number.
3. Loosen `src/lib/offline-queue.ts` line 17's `weight: number` to `weight: number | null` so offline-queued sets can carry the flag too.
4. For it to persist and pre-fill sensibly: add an `is_bodyweight` boolean column to the `exercises` table (new Supabase migration — schema lives outside this repo, see caveat above), and have `libraryToExercisePatch()` default `is_bodyweight: lib.equipment === "body only"` when an exercise is picked from the library.
5. Update the logged-set display (`ExerciseCard.tsx` ~line 479 and `src/app/history/[id]/page.tsx`) to show "Bodyweight" instead of "—" when weight is null.

**Confidence:** High — every citation above was independently re-opened and confirmed; a repo-wide grep for `bodyweight`/`is_bodyweight`/`weight_type` came back empty, ruling out a hidden control elsewhere.

---

## 3. Can't type a decimal weight

**What's happening:** Typing something like `62.5` doesn't work — the decimal point won't "stick," or you get `NaN` in the box.

**Root cause:** In `src/components/ExerciseCard.tsx`, the weight fields are React-controlled inputs whose state is typed `number | ""`, and the `onChange` handler converts the raw typed string to a number on *every keystroke*, then feeds that number straight back into the controlled `value`:

```ts
// line 57 (log-set) / line 67 (edit-set)
const [weight, setWeight] = useState<number | "">("");

// lines 539–546 (log-set input), 411–420 (edit-set input) — same pattern
<input
  inputMode="decimal"
  value={weight}
  onChange={(e) => setWeight(e.target.value === "" ? "" : Number(e.target.value))}
  ...
/>
```

Because the input is controlled, React always displays exactly `String(weight)`. Type "62" then ".": the intermediate string `"62."` is numerically equal to the value already stored (`Number("62.") === 62`), so `setWeight(62)` fires again and React snaps the box back to `"62"` on that render — the `.` never sticks. The next digit then appends to `"62"` instead of `"62."`, giving `"625"` instead of `62.5`. If you type `.` as the *first* character instead, `Number(".")` is `NaN`, and the box literally renders the text `"NaN"`. This was reproduced directly (not just inferred): a minimal React harness running the file's exact `onChange` logic showed both failure modes exactly as described, including React's own dev warning about receiving `NaN` for the `value` attribute.

This is a front-end bug only — the DB column (`weight numeric` per the one committed schema reference, `Workout-Tracker-App-PLANNING.md`) has unbounded decimal precision and isn't the constraint.

**The fix:** Stop storing the weight fields as `number | ""` and stop calling `Number()` inside `onChange` — keep the raw typed string and parse only where math is actually needed:
1. Lines 57 & 67: change both `useState<number | "">("")` to `useState<string>("")`.
2. Lines ~542–544 and ~414–418: change both `onChange` handlers to `setWeight(e.target.value)` / `setEditWeight(e.target.value)` (optionally filtered with `/^\d*\.?\d*$/` to block non-numeric characters while still allowing a trailing `.`).
3. `bumpWeight()` (lines 333–338) currently returns a `number` — change its return to `String(Math.max(0, Math.round((base + delta) * 4) / 4))` to match the new string state.
4. `startEdit()` (line 349) sets `editWeight` from a numeric conversion — wrap it: `setEditWeight(s.weight == null ? "" : String(lbToDisplay(Number(s.weight), unit)))`.
5. `fetchSuggestion()` (line 134) also assigns a raw number into `weight` via `setWeight(lbToDisplay(lb, unit))` — this needs the same `String(...)` wrap or it'll be a type mismatch once `weight`'s state becomes `string`.
6. `logSet()`/`saveEdit()`'s existing `Number(weight)` calls at the save boundary keep working unchanged, since parsing still happens there — just not on every keystroke.

**Confidence:** High — root cause reproduced live, not just read from the code.

---

## 4. Can't edit a set's weight/reps after saving

**What's happening:** You logged the wrong weight for a set and there's no way to go back and fix it.

**Root cause:** Two separate gaps combine here:

**(a) History is fully read-only.** `src/app/history/[id]/page.tsx` is a plain Server Component — no `"use client"`, no mutation call, no button on any logged set anywhere in the file. Once a set moves from Today into History, there is genuinely no code path to touch it.

**(b) Today's view *does* have edit/delete — but it permanently locks out any set that was logged while offline.** `ExerciseCard.tsx` has real inline edit (`startEdit`/`saveEdit`, lines 269–299/347–353) and delete (`deleteSet`, lines 301–331), wired to a click handler on each logged set. But both guard with:
```ts
if (set.id.startsWith("local-")) {
  setError("Wait until this set syncs to edit it.");
  return;
}
```
`"local-"` IDs come from `enqueueSet()` (`src/lib/offline-queue.ts`, lines 41–49) whenever `logSet()` catches a network error and falls back to the offline queue (relevant to issue #6 below — this happens more than it should). The queue is drained by `OfflineSync.tsx`'s `flushQueue()` (lines 7–61), which inserts the row into Supabase but **never fetches the real ID back** (`.insert(...)` with no `.select()`) and has no way to push that ID into `ExerciseCard`'s React state — `OfflineSync()` just returns `null`. So even after a queued set finishes syncing successfully, the already-rendered set in your session still carries `id: "local-..."` for the rest of that page visit, and the edit/delete guard never lifts. The only workaround is a full page reload (which re-fetches from the DB with the real UUID). Given this app targets gym Wi-Fi, that's a common path.

**The fix:**
1. Add real edit/delete to History: extract the set-row list in `history/[id]/page.tsx` into a new `"use client"` component that mirrors `ExerciseCard`'s existing edit UI, using the same `supabase.from("set_logs").update(...)`/`.delete(...)` calls already proven out in `ExerciseCard.saveEdit`/`deleteSet`.
2. Fix the offline-queue permanently-locked state: in `OfflineSync.tsx`'s `flushQueue()`, change the insert to `.insert({...}).select("*").single()` to get the real row back, then reconcile it into `ExerciseCard`'s state (e.g. a custom event `ExerciseCard` listens for) so it replaces the `local-...` entry with the real one once synced — clearing the edit guard automatically instead of requiring a reload.

**Confidence:** High — both gaps confirmed by direct reading; git history confirms the edit/delete guard has been unchanged since it was introduced.

---

## 5. No history / suggested weight on day 2 of a repeated workout

**What's happening:** Doing the same workout two days in a row, day 2 doesn't show what you logged on day 1 or suggest a weight from it.

**Root cause:** The weight-suggestion endpoint (`src/app/api/suggest-weight/route.ts`) links "the same exercise" across sessions **only** via `library_id`. That field is `null` for the vast majority of exercises — including every exercise in the default seeded routine every new user starts with. When `library_id` is null, the code never falls back to matching by name:

```ts
const lib = libraryId ?? exercise?.library_id ?? null;
let exerciseIds = [exerciseId];
if (lib) {
  // ...expand exerciseIds to sibling rows sharing the same library_id
}
// else: exerciseIds stays [exerciseId] — just today's one row
```

The history query then does `.in("exercise_id", exerciseIds)`, so it only ever looks at logs tied to *that exact* `exercises.id`. Here's why that bites specifically on repeated exercises: `cloneTemplateRoutine` in `src/lib/routines.ts` (line 184) inserts every cloned exercise with `library_id: null`, and gives **each day's copy of an exercise its own row/ID**, even when the exercise name repeats across days (confirmed in `Workout_Tracker.csv` — "Hip Adductor Machine" appears on every day, Day 1 through 5, each as a distinct seeded row). Since the program advances one day at a time within the same week focus (`nextPosition` in `src/lib/program.ts`), doing the same lift today and tomorrow is exactly "day 2 of the same workout" from your perspective — but the two logged sets live under two different `exercise_id`s that the endpoint never connects, so day 2 gets `{suggested_weight: null, rationale: "No history for this exercise and week focus yet..."}` even though you logged it yesterday.

Notably, this exact case is *already* handled correctly elsewhere in the codebase: `src/lib/progress.ts`'s `exerciseKey()` explicitly falls back to grouping by exercise name when `library_id` is absent ("Groups by library_id when present so AI/copy rebuilds still stitch history") — that's the fallback `suggest-weight/route.ts` is missing.

**The fix:** In `suggest-weight/route.ts`, add a name-based fallback mirroring `progress.ts`'s `exerciseKey()`:
```ts
} else if (exercise?.name) {
  const { data: siblings } = await supabase
    .from("exercises")
    .select("id")
    .ilike("name", exercise.name.trim());
  exerciseIds = (siblings ?? []).map((r) => r.id as string);
  if (!exerciseIds.includes(exerciseId)) exerciseIds.push(exerciseId);
}
```
This is safe because the downstream query is already scoped to `.eq("sessions.user_id", user.id)` — widening by name can only surface the current user's own logged sets.

**Confidence:** High — the seeded-routine repetition, the null `library_id`, and the missing fallback were all confirmed directly in code and data files.

---

## 6. Saving a set often fails and needs a retry

**What's happening:** Tapping Save frequently fails and you have to press it again.

**Root cause:** `logSet()` in `ExerciseCard.tsx` wraps the save in try/catch. When it catches a genuine network failure, `isNetworkError()` (`src/lib/offline-queue.ts`, lines 65–69) decides whether to queue the set for automatic offline retry:
```ts
return /failed to fetch|network|offline|fetch/i.test(msg);
```
This is a narrow substring match on the browser's error message text — and that text differs by engine. Chrome says "Failed to fetch," Firefox says "NetworkError when attempting to fetch resource," but **Safari/WebKit — i.e. iOS, the platform most likely used at a gym — says just "Load failed."** That string matches none of the regex's substrings, so on iOS a normal connectivity blip gets misclassified as a *non*-network error. `logSet()`'s catch block then takes the "not a network error" branch: it shows a bare error message and does **not** enqueue the set for offline retry and does **not** add it to local state — nothing is saved anywhere. You have to manually retry; if the connection has recovered by then, it works. That matches the reported symptom exactly, and disproportionately for mobile users on imperfect gym Wi-Fi — this app's actual usage environment.

**The fix:** In `isNetworkError()`, check the exception type in addition to the message text — `fetch()` is spec-guaranteed to reject with a `TypeError` on any network failure, regardless of the browser-specific message:
```ts
if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
if (err instanceof TypeError) return true;
const msg = err instanceof Error ? err.message : String(err ?? "");
return /failed to fetch|network|offline|fetch|load failed/i.test(msg);
```
This routes every genuine fetch failure — including Safari's "Load failed" — into the offline-queue path, which immediately commits the set locally ("Saved on this phone — will sync when you are online.") and lets `OfflineSync.tsx` sync it automatically, instead of silently dropping it and waiting for you to notice and retry.

*Minor secondary hardening, not the main cause:* `logSet()` has no `if (busy) return;` guard before setting the busy flag, so a fast double-tap before React disables the button could in theory fire two concurrent saves — worth adding defensively.

*One thing this report can't confirm from the repo:* whether Supabase RLS policies could also cause an "insert succeeds but the select-back after insert fails" false negative (a known PostgREST gotcha) — RLS policies are managed remotely and aren't checked into this repo, so that's an unverified possible contributing factor, not a refutation of the fix above.

**Confidence:** Medium-high — the core mechanism (Safari's "Load failed" not matching the regex) was directly confirmed against the code; there's a small chance RLS-related failures also contribute, which can't be checked without live access to the Supabase project's policies.

---

## 7. "Today" from History opens the wrong (next) day

**What's happening:** Tapping "Today" from the History view shows tomorrow's workout instead of resuming the day you're actually in the middle of.

**Root cause:** `resolveDefaultDay` in `src/lib/workout.ts` (lines 68–121) decides which day `/today` shows when you navigate there with no explicit day/week in the URL (exactly what the bottom-nav "Today" tab does — it's a plain `<Link href="/today">` on every page, including History). It finds the single most recent session with *any* logged set:
```ts
.select("week_focus, day_number, set_logs!inner(id)")
.order("performed_on", { ascending: false })
.order("created_at", { ascending: false })
.limit(1)
```
Notice `performed_on` isn't even in the select — the function has no way to tell "today's in-progress session" apart from "a session from a finished prior day." It then **unconditionally** advances to the next day/focus from whatever that last session was.

The trigger: a `sessions` row is created the moment you log your *first* set of the day — not when the day is complete (`resolveSessionId()`/`logSet()` in `ExerciseCard.tsx`). So: you log one set today, wander over to History, then tap "Today." `resolveDefaultDay` sees "last" = your own partially-done session for today, has no `performed_on` to compare against `todayISO()`, and advances you to tomorrow — even though today isn't remotely finished.

(Manual day-switching via the date picker is unaffected — it pushes explicit `?day=&week=` params, which bypass `resolveDefaultDay` entirely. This only breaks the bare "Today" link/tab.)

**The fix:** In `resolveDefaultDay`:
1. Add `performed_on` to the select.
2. Right after the "no session yet" early return, short-circuit before the advancement logic:
```ts
if (last.performed_on === todayISO()) {
  return {
    weekFocus: showsWeekPicker(mode) ? (last.week_focus as WeekFocus) : defaultWeekFocus(mode),
    dayNumber: Math.min(last.day_number, maxDay),
    wrappedCycle: false,
  };
}
```
Only advance to the next day/focus when the last logged session belongs to a *previous* calendar day. There's no "day complete" flag in the schema to check against instead — this same-day check is the minimal, correct fix given what's actually stored.

**Confidence:** High — the causal chain (log one set → session exists → tap bare "Today" → advances regardless of completion) was traced end to end and confirmed; also confirmed there's no completion flag anywhere in the schema that a better fix could have used instead.

---

## 8. Bottom navigation text too small and not centered

**What's happening:** The tab bar labels look small and sit off-center in their tap targets.

**Root cause:** In `src/components/AppShell.tsx`, the bottom nav's `<Link>`s use:
```
className="min-h-14 px-1 py-2 text-center text-xs font-bold ..."
```
Two separate things going on:
- `text-xs` (12px) is smaller than every other primary label in the app, which use `text-base` (16px) — e.g. the buttons in `LoginForm.tsx`, `ExerciseCard.tsx`, `NewRoutineForm.tsx`. Hence it reads as too small relative to everything else.
- The `<Link>` sits inside a `grid grid-cols-4` (default `align-items: stretch`), so it stretches to fill the 56px (`min-h-14`) row. `text-center` only sets horizontal text alignment — there's no `flex`/`items-center` doing vertical centering, so normal block flow leaves the label sitting near the top of the box instead of centered in it.

**The fix:** Change the tab `<Link>`'s className to add flex centering and bump the font size:
```
flex min-h-14 items-center justify-center px-1 py-2 text-base font-bold ...
```
`flex items-center justify-center` centers the label on both axes within the tap target; `text-xs → text-base` matches the sizing used for other primary labels elsewhere in the app.

**Confidence:** High — straightforward, fully confirmed CSS fix.
