"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_FORCES,
  EXERCISE_IMAGE_BUCKET,
  EXERCISE_LEVELS,
  EXERCISE_MECHANICS,
  exerciseImageUrl,
  MAX_EXERCISE_IMAGES,
  publishProblems,
  publishStatusLabel,
  splitInstructions,
  type CustomExercise,
  type ExerciseVisibility,
} from "@/lib/custom-exercises";
import type { LibraryExercise } from "@/lib/types";

type Saved = { exercise: CustomExercise; library: LibraryExercise };

type AiSuggestions = {
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string | null;
  level: string | null;
  force: string | null;
  mechanic: string | null;
  category: string | null;
};

/** Phone photos are huge — shrink to a JPEG before upload. */
async function toJpeg(file: File, max = 1280): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that photo."));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Couldn't process that photo."))),
        "image/jpeg",
        0.85
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const inputClass =
  "min-h-11 w-full rounded-xl bg-[var(--input)] px-3 text-base text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]";
const labelClass = "text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]";

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-xl bg-[var(--input)] px-2 text-sm capitalize text-[var(--ink)] ring-1 ring-[var(--stroke)]"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function MuscleChips({
  muscles,
  selected,
  onToggle,
}: {
  muscles: string[];
  selected: string[];
  onToggle: (m: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {muscles.map((m) => {
        const on = selected.includes(m);
        return (
          <button
            key={m}
            type="button"
            onClick={() => onToggle(m)}
            className={`min-h-9 rounded-full px-3 text-xs font-semibold capitalize ring-1 ${
              on
                ? "bg-[var(--accent)] text-[var(--accent-ink)] ring-[var(--accent)]"
                : "bg-[var(--input)] text-[var(--muted)] ring-[var(--stroke)]"
            }`}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

export function CustomExerciseForm({
  initial,
  defaultName = "",
  onSaved,
  onClose,
}: {
  initial?: CustomExercise | null;
  defaultName?: string;
  onSaved: (saved: Saved) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? defaultName);
  const [visibility, setVisibility] = useState<ExerciseVisibility>(
    initial?.visibility ?? "private"
  );
  const [equipment, setEquipment] = useState(initial?.equipment ?? "");
  const [level, setLevel] = useState(initial?.level ?? "");
  const [force, setForce] = useState(initial?.force ?? "");
  const [mechanic, setMechanic] = useState(initial?.mechanic ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [primary, setPrimary] = useState<string[]>(initial?.primary_muscles ?? []);
  const [secondary, setSecondary] = useState<string[]>(initial?.secondary_muscles ?? []);
  const [text, setText] = useState((initial?.instructions ?? []).join("\n"));
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [muscleList, setMuscleList] = useState<string[]>([]);
  const [equipList, setEquipList] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState<"write" | "cleanup" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submit, setSubmit] = useState(
    initial?.publish_status === "requested" || initial?.publish_status === "approved"
  );
  // Already sent upstream — the checkbox no longer applies.
  const sent =
    initial?.publish_status === "submitted" || initial?.publish_status === "merged";
  const [showMore, setShowMore] = useState(
    Boolean(initial?.secondary_muscles.length || initial?.force || initial?.mechanic || initial?.category)
  );
  // Photos uploaded in this sitting — removed again if the form is cancelled.
  const freshUploads = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch("/api/exercise-library?meta=1")
      .then((r) => r.json())
      .then((d) => {
        setMuscleList(d.muscles ?? []);
        setEquipList(d.equipment ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cancel() {
    if (freshUploads.current.length) {
      void createClient().storage.from(EXERCISE_IMAGE_BUCKET).remove(freshUploads.current);
    }
    onClose();
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_EXERCISE_IMAGES - images.length;
    if (room <= 0) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const added: string[] = [];
      for (const file of [...files].slice(0, room)) {
        const blob = await toJpeg(file);
        const path = `${user.id}/${crypto.randomUUID()}.jpg`;
        const { error: upError } = await supabase.storage
          .from(EXERCISE_IMAGE_BUCKET)
          .upload(path, blob, { contentType: "image/jpeg" });
        if (upError) throw new Error(upError.message);
        added.push(path);
        freshUploads.current.push(path);
      }
      setImages((prev) => [...prev, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function runAi(mode: "write" | "cleanup") {
    if (mode === "write" && text.trim() && !confirm("Replace your steps with an AI draft? Your notes are used as a starting point.")) {
      return;
    }
    setAiBusy(mode);
    setError(null);
    try {
      const res = await fetch("/api/my-exercises/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          name,
          equipment,
          level,
          primary_muscles: primary,
          instructions: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      setText((data.instructions as string[]).join("\n"));
      // Only fill what's still blank — never overwrite the user's picks.
      const s = data.suggestions as AiSuggestions;
      if (!primary.length && s.primary_muscles.length) setPrimary(s.primary_muscles);
      if (!secondary.length && s.secondary_muscles.length) setSecondary(s.secondary_muscles);
      if (!equipment && s.equipment) setEquipment(s.equipment);
      if (!level && s.level) setLevel(s.level);
      if (!force && s.force) setForce(s.force);
      if (!mechanic && s.mechanic) setMechanic(s.mechanic);
      if (!category && s.category) setCategory(s.category);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setAiBusy(null);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        initial ? `/api/my-exercises/${initial.id}` : "/api/my-exercises",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            visibility,
            equipment: equipment || null,
            level: level || null,
            force: force || null,
            mechanic: mechanic || null,
            category: category || null,
            primary_muscles: primary,
            secondary_muscles: secondary,
            instructions: text,
            images,
            submit_to_free_db: sent ? undefined : visibility === "shared" && submit,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      freshUploads.current = [];
      onSaved(data as Saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  const missingForPublish =
    submit && !sent
      ? publishProblems({
          name,
          visibility,
          equipment: equipment || null,
          level: level || null,
          force: force || null,
          mechanic: mechanic || null,
          category: category || null,
          primary_muscles: primary,
          secondary_muscles: secondary,
          instructions: splitInstructions(text),
          images,
        })
      : [];

  const toggle = (list: string[], set: (v: string[]) => void, m: string) =>
    set(list.includes(m) ? list.filter((x) => x !== m) : [...list, m]);

  const sheet = (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--stroke)]">
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink)]">
            {initial ? "Edit exercise" : "New exercise"}
          </h2>
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--muted)]"
          >
            Cancel
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <label className="block space-y-1">
            <span className={labelClass}>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Cable Hip Thrust"
              className={inputClass}
            />
          </label>

          <div className="space-y-1">
            <span className={labelClass}>Who can use it</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["private", "Private", "Only you"],
                  ["shared", "Shared", "Any Reps user can add it"],
                ] as const
              ).map(([value, title, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVisibility(value)}
                  className={`rounded-xl px-3 py-2 text-left ring-1 ${
                    visibility === value
                      ? "bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]"
                      : "bg-[var(--input)] ring-[var(--stroke)]"
                  }`}
                >
                  <span className="block text-sm font-bold text-[var(--ink)]">{title}</span>
                  <span className="block text-xs text-[var(--muted)]">{hint}</span>
                </button>
              ))}
            </div>
            {visibility === "shared" ? (
              <p className="text-xs text-[var(--muted)]">
                Other Reps users will see the name, photos and steps — not who made
                it. Only you can edit it.
              </p>
            ) : null}
          </div>

          {visibility === "shared" ? (
            <div className="rounded-xl bg-[var(--input)] p-3 ring-1 ring-[var(--stroke)]">
              {sent && initial ? (
                <p className="text-sm text-[var(--ink)]">
                  {publishStatusLabel(initial)}
                  {initial.submission?.pr_url ? (
                    <>
                      {" · "}
                      <a
                        href={initial.submission.pr_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[var(--accent-text)]"
                      >
                        PR #{initial.submission.pr_number}
                      </a>
                    </>
                  ) : null}
                </p>
              ) : (
                <>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={submit}
                      onChange={(e) => {
                        setSubmit(e.target.checked);
                        if (e.target.checked) setShowMore(true);
                      }}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="text-sm text-[var(--ink)]">
                      <span className="font-semibold">Also submit to free-exercise-db</span>
                      , the free public exercise library Reps uses. After a review,
                      the name, steps and photos are sent to its GitHub and become{" "}
                      <span className="font-semibold">public domain</span> — anyone
                      can use them, permanently. Your account isn&apos;t shown. Only
                      include photos you took yourself.
                    </span>
                  </label>
                  {missingForPublish.length ? (
                    <p className="mt-2 text-xs font-semibold text-[var(--danger)]">
                      Still needs {missingForPublish.join(", ")}.
                    </p>
                  ) : null}
                  {initial && publishStatusLabel(initial) ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {publishStatusLabel(initial)}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="space-y-1">
            <span className={labelClass}>
              Photos ({images.length}/{MAX_EXERCISE_IMAGES}) · first is the thumbnail
            </span>
            <div className="grid grid-cols-4 gap-2">
              {images.map((path, i) => (
                <div key={path} className="relative">
                  <Image
                    src={exerciseImageUrl(path)}
                    alt={`Photo ${i + 1}`}
                    width={96}
                    height={96}
                    unoptimized
                    className="aspect-square w-full rounded-xl bg-[var(--canvas)] object-cover ring-1 ring-[var(--stroke)]"
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setImages((prev) => prev.filter((p) => p !== path))}
                    className="absolute right-1 top-1 h-7 w-7 rounded-full bg-black/60 text-sm font-bold text-white"
                  >
                    ×
                  </button>
                  {i > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setImages((prev) => [path, ...prev.filter((p) => p !== path)])
                      }
                      className="mt-1 w-full text-[11px] font-semibold text-[var(--accent-text)]"
                    >
                      Make first
                    </button>
                  ) : null}
                </div>
              ))}
              {images.length < MAX_EXERCISE_IMAGES ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                  className="flex aspect-square w-full items-center justify-center rounded-xl bg-[var(--input)] text-xs font-semibold text-[var(--accent-text)] border border-dashed border-[var(--stroke)] disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : "+ Photo"}
                </button>
              ) : null}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => void addPhotos(e.target.files)}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-end justify-between gap-2">
              <span className={labelClass}>Steps · one per line</span>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={aiBusy !== null || !name.trim()}
                  onClick={() => void runAi("write")}
                  className="text-sm font-semibold text-[var(--accent-text)] disabled:opacity-50"
                >
                  {aiBusy === "write" ? "Writing…" : "✨ Write for me"}
                </button>
                <button
                  type="button"
                  disabled={aiBusy !== null || text.trim().length < 10}
                  onClick={() => void runAi("cleanup")}
                  className="text-sm font-semibold text-[var(--accent-text)] disabled:opacity-50"
                >
                  {aiBusy === "cleanup" ? "Cleaning…" : "✨ Clean up"}
                </button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={"Set up the bench…\nDrive through your heels…"}
              className="w-full rounded-xl bg-[var(--input)] px-3 py-2 text-base leading-relaxed text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="space-y-1">
            <span className={labelClass}>Primary muscles</span>
            <MuscleChips
              muscles={muscleList}
              selected={primary}
              onToggle={(m) => {
                toggle(primary, setPrimary, m);
                setSecondary((prev) => prev.filter((x) => x !== m));
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Choice label="Equipment" value={equipment} options={equipList} onChange={setEquipment} />
            <Choice label="Level" value={level} options={EXERCISE_LEVELS} onChange={setLevel} />
          </div>

          {showMore ? (
            <>
              <div className="space-y-1">
                <span className={labelClass}>Secondary muscles</span>
                <MuscleChips
                  muscles={muscleList.filter((m) => !primary.includes(m))}
                  selected={secondary}
                  onToggle={(m) => toggle(secondary, setSecondary, m)}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Choice label="Force" value={force} options={EXERCISE_FORCES} onChange={setForce} />
                <Choice label="Mechanic" value={mechanic} options={EXERCISE_MECHANICS} onChange={setMechanic} />
                <Choice label="Category" value={category} options={EXERCISE_CATEGORIES} onChange={setCategory} />
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="text-sm font-semibold text-[var(--muted)]"
            >
              More details (secondary muscles, force, mechanic, category)
            </button>
          )}

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </div>

        <div className="border-t border-[var(--stroke)] px-4 py-3">
          <button
            type="button"
            disabled={
              saving ||
              uploading ||
              aiBusy !== null ||
              !name.trim() ||
              missingForPublish.length > 0
            }
            onClick={() => void save()}
            className="min-h-12 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)] disabled:opacity-60"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Save exercise"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
