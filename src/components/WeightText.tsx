"use client";

import { useSettings } from "@/components/SettingsProvider";
import { formatWeight } from "@/lib/units";

export function WeightText({
  lb,
  className,
}: {
  lb: number | null | undefined;
  className?: string;
}) {
  const { settings } = useSettings();
  return <span className={className}>{formatWeight(lb, settings.unit)}</span>;
}
