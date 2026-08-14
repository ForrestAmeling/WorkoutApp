export type WeekFocus = "light" | "middle" | "heavy";

export type PeriodizationMode =
  | "none"
  | "full"
  | "light"
  | "middle"
  | "heavy";

export type RoutineSource = "seed" | "manual" | "ai";

export type Routine = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  uses_periodization: boolean;
  periodization_mode: PeriodizationMode;
  is_active: boolean;
  source: RoutineSource;
  created_at: string;
  updated_at: string;
};

export type RoutineDay = {
  id: string;
  routine_id: string;
  day_number: number;
  name: string;
  sort_order: number;
};

export type Exercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  day_number: number;
  is_accessory: boolean;
  sort_order: number;
  routine_id: string | null;
  routine_day_id: string | null;
  library_id: string | null;
  image_url: string | null;
  is_template: boolean;
};

export type ExerciseTarget = {
  id: string;
  exercise_id: string;
  week_focus: WeekFocus;
  target_sets: number;
  rep_low: number;
  rep_high: number;
};

export type Cycle = {
  id: string;
  user_id: string;
  cycle_number: number;
  started_on: string;
};

export type Session = {
  id: string;
  user_id: string;
  cycle_id: string | null;
  routine_id: string | null;
  week_focus: WeekFocus;
  day_number: number;
  performed_on: string;
  created_at: string;
};

export type SetLog = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  ai_suggested_weight: number | null;
  notes: string | null;
  created_at: string;
};

export type ExerciseWithTarget = Exercise & {
  target: ExerciseTarget;
  sets: SetLog[];
};

export type LibraryExercise = {
  id: string;
  name: string;
  equipment: string | null;
  level: string | null;
  mechanic: string | null;
  force: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string | null;
  images: string[];
  imageUrl: string | null;
};

export type RoutineExerciseInput = {
  name: string;
  library_id?: string | null;
  image_url?: string | null;
  muscle_group?: string | null;
  is_accessory?: boolean;
  target_sets: number;
  rep_low: number;
  rep_high: number;
  /** For periodized routines: full target map. Otherwise middle only. */
  targets?: Partial<Record<WeekFocus, { target_sets: number; rep_low: number; rep_high: number }>>;
};

export type Subscription = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  price_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

export type RoutineDayInput = {
  name: string;
  day_number: number;
  exercises: RoutineExerciseInput[];
};
