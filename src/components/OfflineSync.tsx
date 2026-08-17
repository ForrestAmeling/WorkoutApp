"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadQueue, saveQueue, type QueuedSet } from "@/lib/offline-queue";
import { SET_SYNCED_EVENT, type SetSyncedDetail } from "@/lib/set-sync-events";
import type { SetLog } from "@/lib/types";

async function flushQueue() {
  const items = loadQueue();
  if (items.length === 0) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const remaining: QueuedSet[] = [];
  for (const item of items) {
    try {
      const { data: existing } = await supabase
        .from("sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("routine_id", item.session.routineId)
        .eq("performed_on", item.session.performedOn)
        .eq("week_focus", item.session.weekFocus)
        .eq("day_number", item.session.dayNumber)
        .maybeSingle();

      let sessionId = existing?.id as string | undefined;
      if (!sessionId) {
        const { data: created, error: createError } = await supabase
          .from("sessions")
          .insert({
            user_id: user.id,
            cycle_id: item.session.cycleId,
            routine_id: item.session.routineId,
            week_focus: item.session.weekFocus,
            day_number: item.session.dayNumber,
            performed_on: item.session.performedOn,
          })
          .select("id")
          .single();
        if (createError || !created) {
          remaining.push(item);
          continue;
        }
        sessionId = created.id;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("set_logs")
        .insert({
          session_id: sessionId,
          ...item.log,
        })
        .select("*")
        .single();
      if (insertError || !inserted) {
        remaining.push(item);
        continue;
      }

      // Let any mounted ExerciseCard swap this set's temporary "local-…" id
      // for the real row now that it's actually persisted — otherwise the
      // edit/delete guard on "local-…" ids never clears until a reload.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent<SetSyncedDetail>(SET_SYNCED_EVENT, {
            detail: { localId: item.id, row: inserted as SetLog },
          })
        );
      }
    } catch {
      remaining.push(item);
    }
  }
  saveQueue(remaining);
}

export function OfflineSync() {
  useEffect(() => {
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  return null;
}
