const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const csvPath = path.join(__dirname, "..", "Workout_Tracker.csv");
const csv = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1);

function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      cols.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  cols.push(cur);
  return cols;
}

function parseTarget(t) {
  t = t
    .replace(/\(assisted\)/i, "")
    .replace(/\/leg/i, "")
    .trim();
  const m = t.match(/^(\d+)(?:-(\d+))?x(\d+)-(\d+)$/);
  if (!m) throw new Error("bad target: " + t);
  const setsLow = +m[1];
  const setsHigh = m[2] ? +m[2] : setsLow;
  return { sets: setsHigh, rep_low: +m[3], rep_high: +m[4] };
}

const muscle = {
  "Incline DB Press": "chest",
  "Pull-ups": "back",
  "Leg Press": "legs",
  "Cable Curl": "biceps",
  "Hip Adductor Machine": "hips",
  "Hip Abductor Machine": "hips",
  "Hanging Leg Raise": "core",
  "Cable Row": "back",
  "DB Shoulder Press": "shoulders",
  "Hip Thrusts": "glutes",
  "Rope Pushdowns": "triceps",
  "Cable Reverse Crunch": "core",
  "Cable Flies": "chest",
  "Weighted Step Ups": "legs",
  "Hammer Curl": "biceps",
  "DB Lateral Raise": "shoulders",
  "Leg Extensions": "quads",
  "Cable Overhead Extension": "triceps",
  "Face Pulls": "rear delts",
  "Lying Leg Curl": "hamstrings",
  "Standing Calf Raise": "calves",
};

const accessories = new Set([
  "Hip Adductor Machine",
  "Hip Abductor Machine",
  "Hanging Leg Raise",
  "Cable Reverse Crunch",
  "Face Pulls",
  "Standing Calf Raise",
  "Cable Flies",
  "DB Lateral Raise",
  "Cable Curl",
  "Hammer Curl",
  "Rope Pushdowns",
  "Cable Overhead Extension",
]);

const focusMap = {
  "Week 1 - Light": "light",
  "Week 2 - Middle": "middle",
  "Week 3 - Heavy": "heavy",
};

function uuidFrom(str) {
  const h = crypto.createHash("sha256").update(str).digest("hex");
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-4" +
    h.slice(13, 16) +
    "-a" +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32)
  );
}

const exercises = new Map();
const targets = [];

for (const line of csv) {
  if (!line.trim()) continue;
  const [week, day, name, target] = parseCsvLine(line);
  const dayNum = +day.replace("Day ", "");
  const focus = focusMap[week];
  if (!focus) throw new Error("unknown week: " + week);
  const key = dayNum + "|" + name;
  if (!exercises.has(key)) {
    const sort =
      [...exercises.keys()].filter((k) => k.startsWith(dayNum + "|")).length +
      1;
    exercises.set(key, {
      day: dayNum,
      name,
      muscle: muscle[name] || null,
      acc: accessories.has(name),
      sort,
    });
  }
  targets.push({ key, focus, ...parseTarget(target) });
}

const sql = [
  "-- Refresh template program only. Does not touch user sessions or set logs.",
  "delete from exercise_targets",
  "where exercise_id in (",
  "  select id from exercises where is_template = true or routine_id is null",
  ");",
  "delete from exercises where is_template = true or routine_id is null;",
];

for (const [key, e] of exercises) {
  const id = uuidFrom("ex:" + key);
  const name = e.name.replace(/'/g, "''");
  sql.push(
    `insert into exercises (id, name, muscle_group, day_number, is_accessory, sort_order, is_template) values ('${id}', '${name}', ${
      e.muscle ? `'${e.muscle}'` : "null"
    }, ${e.day}, ${e.acc}, ${e.sort}, true);`
  );
}

for (const t of targets) {
  const eid = uuidFrom("ex:" + t.key);
  sql.push(
    `insert into exercise_targets (exercise_id, week_focus, target_sets, rep_low, rep_high) values ('${eid}', '${t.focus}', ${t.sets}, ${t.rep_low}, ${t.rep_high});`
  );
}

const out = path.join(__dirname, "..", "seed.sql");
fs.writeFileSync(out, sql.join("\n") + "\n");
console.log("Wrote", out);
console.log("exercises", exercises.size, "targets", targets.length);
