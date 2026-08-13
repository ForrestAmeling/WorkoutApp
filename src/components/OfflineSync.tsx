"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadQueue, saveQueue, type QueuedSet } from "@/lib/offline-queue";

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

      const { error: insertError } = await supabase.from("set_logs").insert({
        session_id: sessionId,
        ...item.log,
      });
      if (insertError) remaining.push(item);
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
