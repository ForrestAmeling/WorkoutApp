"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WEEK_LABELS } from "@/lib/program";
import type { SessionProgressPoint } from "@/lib/progress";
import { useSettings } from "@/components/SettingsProvider";
import { formatWeight, type WeightUnit } from "@/lib/units";

function useChartTheme() {
  const { settings } = useSettings();
  const [colors, setColors] = useState({
    grid: "#d5ddd8",
    tick: "#5b6b64",
    line: "#1a2a12",
    line2: "#3d6b52",
    line3: "#8aa396",
    accent: "#d6ff3f",
    card: "#ffffff",
    ink: "#14201c",
    stroke: "rgba(20,32,28,0.12)",
  });

  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    setColors({
      grid: s.getPropertyValue("--chart-grid").trim() || "#d5ddd8",
      tick: s.getPropertyValue("--chart-tick").trim() || "#5b6b64",
      line: s.getPropertyValue("--chart-line").trim() || "#1a2a12",
      line2: s.getPropertyValue("--chart-line-2").trim() || "#3d6b52",
      line3: s.getPropertyValue("--chart-line-3").trim() || "#8aa396",
      accent: s.getPropertyValue("--accent").trim() || "#d6ff3f",
      card: s.getPropertyValue("--card").trim() || "#ffffff",
      ink: s.getPropertyValue("--ink").trim() || "#14201c",
      stroke: s.getPropertyValue("--stroke").trim() || "rgba(20,32,28,0.12)",
    });
  }, [settings.theme]);

  return colors;
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-[var(--card)] px-3 py-4 ring-1 ring-[var(--stroke)] animate-rise">
      <h3 className="mb-2 px-1 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--ink)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

export type ChartPoint = SessionProgressPoint & { label: string };

/**
 * The recharts-dependent half of the Progress page, split out of
 * ProgressDashboard.tsx so it can be loaded via next/dynamic — recharts
 * (plus its d3 submodules) is a non-trivial chunk of JS that the routine
 * picker, muscle-volume bars, and AI-accuracy summary don't need at all.
 */
export function ExerciseCharts({
  chartPoints,
  unit,
}: {
  chartPoints: ChartPoint[];
  unit: WeightUnit;
}) {
  const chart = useChartTheme();

  return (
    <div className="space-y-4">
      <ChartCard title="Weight (top set)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={chartPoints}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fill: chart.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: chart.grid }}
            />
            <YAxis
              tick={{ fill: chart.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${chart.stroke}`,
                background: chart.card,
                color: chart.ink,
                fontSize: 12,
              }}
              labelStyle={{ color: chart.ink }}
              itemStyle={{ color: chart.ink }}
              formatter={(value) => [
                `${formatWeight(value as number, unit)}`,
                "Top weight",
              ]}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as ChartPoint | undefined;
                if (!row) return "";
                return `${row.date} · ${WEEK_LABELS[row.weekFocus]}`;
              }}
            />
            <Line
              type="monotone"
              dataKey="maxWeight"
              stroke={chart.line}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: chart.accent, stroke: chart.line }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Reps (session average)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={chartPoints}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fill: chart.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: chart.grid }}
            />
            <YAxis
              tick={{ fill: chart.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${chart.stroke}`,
                background: chart.card,
                color: chart.ink,
                fontSize: 12,
              }}
              labelStyle={{ color: chart.ink }}
              itemStyle={{ color: chart.ink }}
              formatter={(value) => [`${value as number}`, "Avg reps"]}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as ChartPoint | undefined;
                if (!row) return "";
                return `${row.date} · ${WEEK_LABELS[row.weekFocus]} · ${row.sets} sets`;
              }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              wrapperStyle={{ fontSize: 12, color: chart.tick }}
            />
            <Line
              type="monotone"
              dataKey="avgReps"
              name="Avg reps"
              stroke={chart.line2}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: chart.accent, stroke: chart.line2 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="maxReps"
              name="Best set"
              stroke={chart.line3}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Volume (weight × reps)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={chartPoints}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fill: chart.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: chart.grid }}
            />
            <YAxis
              tick={{ fill: chart.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${chart.stroke}`,
                background: chart.card,
                color: chart.ink,
                fontSize: 12,
              }}
              labelStyle={{ color: chart.ink }}
              itemStyle={{ color: chart.ink }}
              formatter={(value) => [`${value as number}`, "Volume"]}
            />
            <Line
              type="monotone"
              dataKey="volume"
              stroke={chart.line2}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: chart.accent, stroke: chart.line2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
