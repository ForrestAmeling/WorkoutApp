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

const DECIMAL_INPUT_PATTERN = /^\d*\.?\d*$/;

/**
 * True while `value` is a valid (possibly in-progress) decimal a user could
 * be typing, e.g. "", ".", "62", "62.", "62.5". Filter onChange on
 * controlled weight inputs with this instead of coercing to Number() on
 * every keystroke — coercing snaps the field's displayed value back to the
 * already-stored number and makes it impossible to ever type a "." (e.g.
 * "62." parses to the same 62 already stored, so the input re-renders as
 * "62" and the next digit appends to that instead of after the decimal).
 */
export function isPartialDecimal(value: string): boolean {
  return DECIMAL_INPUT_PATTERN.test(value);
}
