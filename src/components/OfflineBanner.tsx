"use client";

import { useOffline } from "next/offline";

export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div
      role="status"
      className="bg-[var(--solid)] px-4 py-2 text-center text-xs font-semibold text-[var(--on-solid)]"
    >
      You are offline. Sets save on this phone and sync when you reconnect.
    </div>
  );
}
