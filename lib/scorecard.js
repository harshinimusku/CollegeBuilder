const SCORECARD_URL = "https://api.data.gov/ed/collegescorecard/v1/schools.json";
const PER_PAGE = 100;

// If the primary states return fewer than this many colleges, we broaden the geography once (never the scoring rules) to give the ranker enough choices.
export const MIN_CANDIDATE_POOL = 20;

// Adjacent states, used both for state selection and for location scoring.
export const NEIGHBORING_STATES = {
  AL: ["FL", "GA", "MS", "TN"], AZ: ["CA", "NV", "NM", "UT"], AR: ["LA", "MS", "MO", "OK", "TN", "TX"],
  CA: ["OR", "NV", "AZ"], CO: ["WY", "NE", "KS", "OK", "NM", "UT"], CT: ["NY", "MA", "RI"],
  DE: ["MD", "NJ", "PA"], DC: ["MD", "VA"], FL: ["GA", "AL"], GA: ["FL", "AL", "SC", "NC", "TN"],
  IL: ["WI", "IA", "MO", "KY", "IN"], IN: ["IL", "MI", "OH", "KY"], IA: ["MN", "WI", "IL", "MO", "NE", "SD"],
  KS: ["NE", "MO", "OK", "CO"], KY: ["IN", "OH", "WV", "VA", "TN", "MO", "IL"], LA: ["TX", "AR", "MS"],
  ME: ["NH"], MD: ["PA", "DE", "VA", "WV", "DC"], MA: ["NY", "CT", "RI", "NH", "VT"],
  MI: ["OH", "IN", "WI"], MN: ["WI", "IA", "SD", "ND"], MS: ["LA", "AR", "TN", "AL"],
  MO: ["IA", "IL", "KY", "TN", "AR", "OK", "KS", "NE"], MT: ["ND", "SD", "WY", "ID"], NE: ["SD", "IA", "MO", "KS", "CO", "WY"],
  NV: ["CA", "OR", "ID", "UT", "AZ"], NH: ["ME", "MA", "VT"], NJ: ["NY", "PA", "DE"],
  NM: ["AZ", "CO", "OK", "TX"], NY: ["PA", "NJ", "CT", "MA", "VT"], NC: ["VA", "TN", "GA", "SC"],
  ND: ["MN", "SD", "MT"], OH: ["PA", "WV", "KY", "IN", "MI"], OK: ["KS", "MO", "AR", "TX", "NM", "CO"],
  OR: ["WA", "ID", "NV", "CA"], PA: ["NY", "NJ", "DE", "MD", "WV", "OH"], RI: ["CT", "MA"],
  SC: ["NC", "GA"], SD: ["ND", "MN", "IA", "NE", "WY", "MT"], TN: ["KY", "VA", "NC", "GA", "AL", "MS", "AR", "MO"],
  TX: ["OK", "AR", "LA", "NM"], UT: ["ID", "WY", "CO", "NM", "AZ", "NV"], VT: ["NY", "NH", "MA"],
  VA: ["MD", "NC", "TN", "KY", "WV", "DC"], WA: ["OR", "ID"], WV: ["PA", "MD", "VA", "KY", "OH"],
  WI: ["MI", "MN", "IA", "IL"], WY: ["MT", "SD", "NE", "CO", "UT", "ID"]
};

const CLIMATE_STATES = {
  warm: ["FL", "CA", "SC", "NC", "GA", "TX", "AZ", "AL", "LA", "HI"],
  cool: ["ME", "VT", "NH", "MA", "MN", "WI", "MI", "NY", "CO", "WA"],
  four_seasons: ["PA", "VA", "MD", "OH", "NY", "NJ", "NC", "TN", "MO", "IL"]
};

const DEFAULT_STATES = ["PA", "NY", "MA", "VA", "NC", "FL", "IL", "TX", "CO", "CA"];
const EXPANSION_STATES = ["CA", "TX", "NY", "FL", "PA", "OH", "IL", "MI", "GA", "NC", "MA", "WA"];

// CIP family -> Scorecard's program_percentage.<name> field (there's no program_available.<cip>).
const CIP_TO_PROGRAM_FIELD = {
  "01": "agriculture", "03": "resources", "04": "architecture", "05": "ethnic_cultural_gender",
  "09": "communication", "10": "communications_technology", "11": "computer", "12": "personal_culinary",
  "13": "education", "14": "engineering", "15": "engineering_technology", "16": "language",
  "19": "family_consumer_science", "22": "legal", "23": "english", "24": "humanities",
  "25": "library", "26": "biological", "27": "mathematics", "29": "military",
  "30": "multidiscipline", "31": "parks_recreation_fitness", "38": "philosophy_religious",
  "39": "theology_religious_vocation", "40": "physical_science", "41": "science_technology",
  "42": "psychology", "43": "security_law_enforcement", "44": "public_administration_social_service",
  "45": "social_science", "46": "construction", "47": "mechanic_repair_technology",
  "48": "precision_production", "49": "transportation", "50": "visual_performing",
  "51": "health", "52": "business_marketing", "54": "history"
};

//Fetches a broad candidate pool. Broadens geography once if the primary states didn't return enough colleges. Returns deduped, normalized colleges plus the states we actually queried (for logging).
export async function fetchCandidates(profile, apiKey) {
  const primary = choosePrimaryStates(profile);
  let colleges = await fetchStates(primary, profile, apiKey);
  let states = [...primary];

  if (colleges.length < MIN_CANDIDATE_POOL) {
    const extra = EXPANSION_STATES.filter(s => !primary.includes(s));
    const more = await fetchStates(extra, profile, apiKey);
    colleges = dedupe([...colleges, ...more]);
    states = [...primary, ...extra];
  }

  return { colleges, states };
}

// Search College Scorecard by institution name (for manual add). Returns up to 10 normalized colleges — no scoring, no pipeline.
export async function searchByName(name, apiKey, cipCodes = []) {
  const url = new URL(SCORECARD_URL);
  url.searchParams.set("api_key", apiKey || "DEMO_KEY");
  url.searchParams.set("school.name", name);
  url.searchParams.set("school.operating", "1");
  url.searchParams.set("per_page", "20");
  url.searchParams.set("fields", buildFields(cipCodes));
  const rows = await fetchRows(url);
  return dedupe(rows.map(row => normalizeSchool(row, cipCodes))).slice(0, 10);
}

// Three clear cases: explicit states, else climate region, else home + neighbors, else defaults.
export function choosePrimaryStates(profile) {
  if (profile.preferredStates.length) return profile.preferredStates.slice(0, 8);
  if (profile.climatePreference !== "any") {
    return unique([profile.homeState, ...(CLIMATE_STATES[profile.climatePreference] ?? [])]).slice(0, 8);
  }
  if (profile.homeState) {
    return unique([profile.homeState, ...(NEIGHBORING_STATES[profile.homeState] ?? [])]).slice(0, 8);
  }
  return DEFAULT_STATES;
}

// --- fetching --------------------------------------------------------------

async function fetchStates(states, profile, apiKey) {
  const settled = await Promise.allSettled(states.map(state => fetchOneState(state, profile, apiKey)));
  const colleges = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") colleges.push(...result.value);
    else console.warn(`Scorecard fetch failed for ${states[i]}: ${result.reason?.message}`);
  });
  return dedupe(colleges);
}

async function fetchOneState(state, profile, apiKey) {
  const url = new URL(SCORECARD_URL);
  url.searchParams.set("api_key", apiKey || "DEMO_KEY");
  url.searchParams.set("school.state", state);
  url.searchParams.set("school.operating", "1");
  url.searchParams.set("school.main_campus", "1");
  url.searchParams.set("school.degrees_awarded.predominant", "3"); // predominantly bachelor's
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("fields", buildFields(profile.cipCodes));
  const rows = await fetchRows(url);
  return rows.map(row => normalizeSchool(row, profile.cipCodes));
}

async function fetchRows(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new Error(`College Scorecard request failed (${response.status}): ${detail}`);
  }
  const payload = await response.json();
  return payload.results ?? [];
}

function dedupe(colleges) {
  return [...new Map(colleges.filter(c => c.id && c.name).map(c => [c.id, c])).values()];
}

// --- fields & normalization ------------------------------------------------

function buildFields(cipCodes) {
  const base = [
    "id", "school.name", "school.city", "school.state", "school.ownership", "school.locale",
    "school.operating", "school.main_campus", "school.degrees_awarded.predominant",
    "latest.student.size", "latest.admissions.admission_rate.overall",
    "latest.admissions.sat_scores.average.overall", "latest.cost.avg_net_price.overall",
    "latest.completion.rate_suppressed.overall"
  ];
  const programFields = new Set();
  for (const code of cipCodes.slice(0, 4)) {
    const field = CIP_TO_PROGRAM_FIELD[code];
    if (field) programFields.add(`latest.academics.program_percentage.${field}`);
  }
  return [...base, ...programFields].join(",");
}

function normalizeSchool(row, cipCodes) {
  return {
    id: String(row.id),
    name: row["school.name"],
    city: row["school.city"],
    state: row["school.state"],
    ownership: numberOrNull(row["school.ownership"]),
    setting: settingFromLocale(numberOrNull(row["school.locale"])),
    size: numberOrNull(row["latest.student.size"]),
    admissionRate: numberOrNull(row["latest.admissions.admission_rate.overall"]),
    sat: numberOrNull(row["latest.admissions.sat_scores.average.overall"]),
    netPrice: numberOrNull(row["latest.cost.avg_net_price.overall"]),
    completionRate: numberOrNull(row["latest.completion.rate_suppressed.overall"]),
    programs: offeredPrograms(row, cipCodes),
    isOperating: row["school.operating"] !== 0,
    isMainCampus: row["school.main_campus"] !== 0,
    offersBachelors: numberOrNull(row["school.degrees_awarded.predominant"]) === 3
  };
}

// Which of the student's requested CIP families this school actually offers.
function offeredPrograms(row, cipCodes) {
  return (cipCodes ?? []).filter(code => {
    const field = CIP_TO_PROGRAM_FIELD[code];
    if (!field) return false;
    const pct = numberOrNull(row[`latest.academics.program_percentage.${field}`]);
    return Number.isFinite(pct) && pct > 0;
  });
}

function settingFromLocale(locale) {
  if (!Number.isFinite(locale)) return "any";
  if (locale >= 11 && locale <= 13) return "urban";
  if (locale >= 21 && locale <= 23) return "suburban";
  if (locale >= 31 && locale <= 33) return "town";
  if (locale >= 41 && locale <= 43) return "rural";
  return "any";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
