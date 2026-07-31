import { geminiJson } from "./gemini.js";

// The one normalized profile shape the whole backend uses. Both input modes (free text via Gemini, or the structured form) produce exactly this object so nothing downstream has to care which mode was used.
//
//   { studentName, majors, cipCodes, sat, gpa, homeState, preferredStates,
//     financialAidNeed, sizePreference, settingPreference, ownershipPreference,
//     climatePreference }

// Free-text path: Gemini extracts fields, then we normalize them.
export async function profileFromGemini(description, config) {
  const raw = await geminiJson({
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    schema: PROFILE_SCHEMA,
    temperature: 0.1,
    systemInstruction: [
      "You extract a structured college-search profile from a counselor's free-form description.",
      "Use only facts stated or reasonably implied. Use null or 'any' when unknown.",
      "Normalize every US state to an uppercase two-letter abbreviation.",
      "home_state is where the student currently lives; preferred_states are only states the student wants colleges in.",
      "Map intended majors to two-digit CIP families. Do not invent achievements, scores, preferences, or demographics.",
      "This tool uses public data; do not infer protected traits."
    ].join(" "),
    input: description
  });
  return normalizeProfile(raw);
}

// Gets the form details and normalizes them
export function profileFromForm(form = {}) {
  return normalizeProfile(form);
}

// Turn either raw shape into the canonical profile. Accepts snake_case keys (what both the form and Gemini produce) and validates/clamps each value.
export function normalizeProfile(raw = {}) {
  const majors = toArray(raw.majors).map(m => String(m).trim()).filter(Boolean);

  let cipCodes = toArray(raw.cip_codes).map(c => String(c).trim().padStart(2, "0")).filter(c => c !== "00");
  if (!cipCodes.length && majors.length) cipCodes = cipFromMajors(majors);

  const preferredStates = unique(toArray(raw.preferred_states).flatMap(splitStates).map(normalizeState));

  return {
    studentName: raw.student_name ? String(raw.student_name).trim() : null,
    majors,
    cipCodes: unique(cipCodes).slice(0, 4),
    sat: clampInt(raw.sat, 400, 1600),
    gpa: clampNum(raw.gpa, 0, 5),
    homeState: normalizeState(raw.home_state),
    preferredStates,
    financialAidNeed: oneOf(raw.financial_aid_need, ["low", "medium", "high"], "medium"),
    sizePreference: oneOf(raw.school_size, ["small", "medium", "large", "any"], "any"),
    settingPreference: oneOf(raw.setting, ["urban", "suburban", "town", "rural", "any"], "any"),
    ownershipPreference: oneOf(raw.school_type, ["public", "private_nonprofit", "any"], "any"),
    climatePreference: oneOf(raw.climate, ["any", "warm", "cool", "four_seasons"], "any")
  };
}

// helper functions
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function splitStates(value) {
  return String(value).split(/[,\s]+/).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clampInt(value, lo, hi) {
  const n = clampNum(value, lo, hi);
  return n == null ? null : Math.round(n);
}

function clampNum(value, lo, hi) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

const STATE_NAMES = new Map([
  ["alabama", "AL"], ["alaska", "AK"], ["arizona", "AZ"], ["arkansas", "AR"], ["california", "CA"],
  ["colorado", "CO"], ["connecticut", "CT"], ["delaware", "DE"], ["florida", "FL"], ["georgia", "GA"],
  ["hawaii", "HI"], ["idaho", "ID"], ["illinois", "IL"], ["indiana", "IN"], ["iowa", "IA"],
  ["kansas", "KS"], ["kentucky", "KY"], ["louisiana", "LA"], ["maine", "ME"], ["maryland", "MD"],
  ["massachusetts", "MA"], ["michigan", "MI"], ["minnesota", "MN"], ["mississippi", "MS"], ["missouri", "MO"],
  ["montana", "MT"], ["nebraska", "NE"], ["nevada", "NV"], ["new hampshire", "NH"], ["new jersey", "NJ"],
  ["new mexico", "NM"], ["new york", "NY"], ["north carolina", "NC"], ["north dakota", "ND"], ["ohio", "OH"],
  ["oklahoma", "OK"], ["oregon", "OR"], ["pennsylvania", "PA"], ["rhode island", "RI"], ["south carolina", "SC"],
  ["south dakota", "SD"], ["tennessee", "TN"], ["texas", "TX"], ["utah", "UT"], ["vermont", "VT"],
  ["virginia", "VA"], ["washington", "WA"], ["west virginia", "WV"], ["wisconsin", "WI"], ["wyoming", "WY"],
  ["district of columbia", "DC"], ["washington dc", "DC"]
]);
const VALID_STATE_CODES = new Set(STATE_NAMES.values());

function normalizeState(value) {
  const cleaned = String(value ?? "").trim().replace(/\./g, "");
  if (!cleaned) return null;
  if (VALID_STATE_CODES.has(cleaned.toUpperCase())) return cleaned.toUpperCase();
  return STATE_NAMES.get(cleaned.toLowerCase()) ?? null;
}

// Keyword -> CIP family, used only when free-text majors arrive without codes.
const CIP_HINTS = [
  [/computer|programming|software|cyber/i, "11"], [/engineering/i, "14"], [/biolog|life science|marine/i, "26"],
  [/business|finance|account|marketing/i, "52"], [/psychology/i, "42"], [/nursing|health|pre-?med|medicine/i, "51"],
  [/education|teaching/i, "13"], [/art|design|music|theat|film/i, "50"], [/environment|natural resources/i, "03"],
  [/politic|government|economics|sociology/i, "45"], [/communication|journalism|media/i, "09"],
  [/math|statistics|data science/i, "27"], [/english|literature|writing/i, "23"], [/history/i, "54"], [/architecture/i, "04"]
];

function cipFromMajors(majors) {
  const codes = [];
  for (const [pattern, code] of CIP_HINTS) if (majors.some(m => pattern.test(m))) codes.push(code);
  return codes;
}

// Shape Gemini must return for profile extraction.
export const PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    student_name: { type: ["string", "null"] },
    home_state: { type: ["string", "null"], description: "Two-letter US state abbreviation when inferable." },
    sat: { type: ["integer", "null"], minimum: 400, maximum: 1600 },
    gpa: { type: ["number", "null"], minimum: 0, maximum: 5 },
    majors: { type: "array", items: { type: "string" }, maxItems: 5 },
    cip_codes: { type: "array", items: { type: "string", description: "Two-digit CIP family, e.g. 11 for computer science." }, maxItems: 4 },
    preferred_states: { type: "array", items: { type: "string" }, maxItems: 12 },
    financial_aid_need: { type: "string", enum: ["low", "medium", "high"] },
    school_size: { type: "string", enum: ["small", "medium", "large", "any"] },
    setting: { type: "string", enum: ["urban", "suburban", "town", "rural", "any"] },
    school_type: { type: "string", enum: ["public", "private_nonprofit", "any"] },
    climate: { type: "string", enum: ["any", "warm", "cool", "four_seasons"] }
  },
  required: [
    "student_name", "home_state", "sat", "gpa", "majors", "cip_codes",
    "preferred_states", "financial_aid_need", "school_size", "setting", "school_type", "climate"
  ]
};
