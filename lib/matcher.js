import { NEIGHBORING_STATES } from "./scorecard.js";

// Preference points are fixed and additive — each signal contributes at most this many points, and the total is out of 100.
// "why is major 30 but size 5?" -> because major is what the student most directly asked for; size is a light tie-breaker.
export const MAX_POINTS = {
  major: 30,
  academics: 25,
  location: 20,
  affordability: 10,
  size: 5,
  setting: 5,
  ownership: 5
};

// ensures the college can be suggested - it needs to be operating, needs to offer bacherlors degree, and is main campus
export function isEligibleCollege(college) {
  return college.isOperating !== false && college.offersBachelors !== false && college.isMainCampus !== false;
}

//Classify by Target, Reach, and Likely
export function classifyAcademicFit(profile, college) {
  if (Number.isFinite(profile.sat) && Number.isFinite(college.sat)) {
    const delta = profile.sat - college.sat;
    if (delta <= -100) return "Reach";
    if (delta >= 100) return "Likely";
    return "Target";
  }
  if (Number.isFinite(college.admissionRate)) {
    if (college.admissionRate < 0.3) return "Reach";
    if (college.admissionRate > 0.7) return "Likely";
  }
  return "Target";
}

// How well the college matches the student's stated preferences. Returns a total plus a per-signal breakdown so the number is fully explainable.
export function scorePreferences(profile, college) {
  const breakdown = {
    major: scoreMajor(profile, college),
    academics: scoreAcademics(profile, college),
    location: scoreLocation(profile, college),
    affordability: scoreAffordability(profile, college),
    size: scoreSize(profile, college),
    setting: scoreSetting(profile, college),
    ownership: scoreOwnership(profile, college)
  };
  const total = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
  return { total, breakdown };
}

//Select 3 from each category, then fill remaining slots from the overall ranking.
export function selectBalancedList(colleges, total = 9) {
  const ranked = [...colleges].sort((a, b) => b.matchScore - a.matchScore);
  const selected = [];
  const used = new Set();

  for (const category of ["Reach", "Target", "Likely"]) {
    for (const college of ranked.filter(c => c.category === category).slice(0, 3)) {
      selected.push(college);
      used.add(college.id);
    }
  }
  for (const college of ranked) {
    if (selected.length >= total) break;
    if (!used.has(college.id)) {
      selected.push(college);
      used.add(college.id);
    }
  }
  return selected.slice(0, total);
}

// Fallback copy when Gemini is unavailable.
export function deterministicNarratives(profile, colleges) {
  const major = profile.majors?.length ? profile.majors.join(" / ") : "the student's interests";
  return {
    overview: `A preliminary list of ${colleges.length} colleges for ${major}, balanced across Reach, Target, and Likely ranges.`,
    strategyNotes: [
      "Reach, Target, and Likely are planning ranges, not admission predictions.",
      "Confirm exact majors, current costs, and financial-aid policies with each college.",
      "Use each college's net-price calculator before making affordability decisions."
    ],
    colleges: colleges.map(c => ({
      id: c.id,
      whyFit: templateWhyFit(c),
      watchOut: templateWatchOut(c)
    }))
  };
}

function scoreMajor(profile, college) {
  if (!profile.cipCodes.length) return 0;
  return (college.programs ?? []).length ? MAX_POINTS.major : 0;
}

// Academic strength as an outcome signal (graduation rate), distinct from the Reach/Target/Likely category. Neutral half-credit when data is missing.
function scoreAcademics(_profile, college) {
  if (!Number.isFinite(college.completionRate)) return 12;
  return Math.round(college.completionRate * MAX_POINTS.academics);
}

function scoreLocation(profile, college) {
  if (profile.preferredStates.includes(college.state)) return 20;
  if (college.state === profile.homeState) return 18;
  const neighbors = NEIGHBORING_STATES[profile.homeState] ?? [];
  if (neighbors.includes(college.state)) return 10;
  return 0;
}

function scoreAffordability(profile, college) {
  if (profile.financialAidNeed !== "high") return 0;
  if (!Number.isFinite(college.netPrice)) return 0;
  if (college.netPrice <= 15000) return 10;
  if (college.netPrice <= 25000) return 5;
  return 0;
}

function scoreSize(profile, college) {
  if (profile.sizePreference === "any") return 0;
  return sizeBand(college.size) === profile.sizePreference ? 5 : 0;
}

function scoreSetting(profile, college) {
  if (profile.settingPreference === "any") return 0;
  return college.setting === profile.settingPreference ? 5 : 0;
}

function scoreOwnership(profile, college) {
  if (profile.ownershipPreference === "any") return 0;
  if (profile.ownershipPreference === "public" && college.ownership === 1) return 5;
  if (profile.ownershipPreference === "private_nonprofit" && college.ownership === 2) return 5;
  return 0;
}

function sizeBand(size) {
  if (!Number.isFinite(size)) return null;
  if (size < 5000) return "small";
  if (size <= 15000) return "medium";
  return "large";
}

// Deterministic description for a single (usually manually added) college, used when Gemini isn't available.
export function describeCollegeFallback(college) {
  return { whyFit: templateWhyFit(college), watchOut: templateWatchOut(college) };
}


function templateWhyFit(college) {
  const bits = [];
  if ((college.programs ?? []).length) bits.push("offers the requested program family");
  if (college.category === "Likely") bits.push("is an accessible option given its admissions profile");
  else if (college.category === "Target") bits.push("is a solid mid-range fit");
  else bits.push("is an aspirational reach that keeps the list balanced");
  return `${college.name} ${bits.join(" and ")}.`;
}

function templateWatchOut(college) {
  if (Number.isFinite(college.netPrice) && college.netPrice > 28000) {
    return "Run the net-price calculator; the published average may not reflect this student's aid.";
  }
  if (!Number.isFinite(college.sat)) {
    return "Scorecard didn't report an average SAT, so the category is less certain.";
  }
  return "Verify current programs, costs, deadlines, and admissions data on the official site.";
}
