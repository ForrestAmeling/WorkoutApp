export type WeightUnit = "lb" | "kg";

const LB_PER_KG = 2.2046226218;

export function unitLabel(unit: WeightUnit) {
  return unit === "kg" ? "kg" : "lb";
}

export function lbToDisplay(lb: number, unit: WeightUnit): number {
  if (unit === "lb") return Math.round(lb * 4) / 4;
  return Math.round((lb / LB_PER_KG) * 2) / 2;
}

export function displayToLb(value: number, unit: WeightUnit): number {
  if (unit === "lb") return Math.round(value * 4) / 4;
  return Math.round(value * LB_PER_KG * 4) / 4;
}

export function formatWeight(
  lb: number | null | undefined,
  unit: WeightUnit
): string {
  if (lb == null || Number.isNaN(lb)) return "—";
  return `${lbToDisplay(lb, unit)} ${unitLabel(unit)}`;
}

export function weightStep(unit: WeightUnit) {
  return unit === "kg" ? 2.5 : 2.5;
}

export function roundSuggestion(lb: number, unit: WeightUnit): number {
  if (unit === "kg") {
    return displayToLb(lbToDisplay(lb, "kg"), "kg");
  }
  return Math.round(lb / 2.5) * 2.5;
}
