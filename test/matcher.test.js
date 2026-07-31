import test from "node:test";
import assert from "node:assert/strict";
import { isEligibleCollege, classifyAcademicFit, scorePreferences, selectBalancedList, MAX_POINTS } from "../lib/matcher.js";

const baseProfile = {
  cipCodes: [], preferredStates: [], homeState: null, sat: null,
  financialAidNeed: "medium", sizePreference: "any", settingPreference: "any", ownershipPreference: "any"
};

function college(over = {}) {
  return {
    id: "1", name: "X", state: "CA", ownership: 1, setting: "urban", size: 9000,
    admissionRate: 0.5, sat: 1200, netPrice: 20000, completionRate: 0.6, programs: [],
    isOperating: true, isMainCampus: true, offersBachelors: true, ...over
  };
}

test("major preference raises the score", () => {
  const profile = { ...baseProfile, cipCodes: ["11"] };
  const withMajor = scorePreferences(profile, college({ programs: ["11"] }));
  const without = scorePreferences(profile, college({ programs: [] }));
  assert.ok(withMajor.total > without.total);
  assert.equal(withMajor.breakdown.major, MAX_POINTS.major);
});

test("location preference raises the score", () => {
  const profile = { ...baseProfile, preferredStates: ["CA"] };
  assert.ok(scorePreferences(profile, college({ state: "CA" })).total > scorePreferences(profile, college({ state: "NY" })).total);
});

test("high aid need rewards a low net price", () => {
  const profile = { ...baseProfile, financialAidNeed: "high" };
  assert.ok(scorePreferences(profile, college({ netPrice: 12000 })).total > scorePreferences(profile, college({ netPrice: 40000 })).total);
});

test("missing college data does not crash scoring or classification", () => {
  const profile = { ...baseProfile, cipCodes: ["11"], financialAidNeed: "high", sizePreference: "medium", settingPreference: "urban", ownershipPreference: "public" };
  const sparse = college({ size: null, setting: "any", admissionRate: null, sat: null, netPrice: null, completionRate: null, ownership: null, programs: [] });
  assert.doesNotThrow(() => scorePreferences(profile, sparse));
  assert.ok(["Reach", "Target", "Likely"].includes(classifyAcademicFit(profile, sparse)));
});

test("academic category is independent of the match score", () => {
  const profile = { ...baseProfile, preferredStates: ["CA"] };
  const inState = college({ id: "a", state: "CA", sat: 1200 });
  const outState = college({ id: "b", state: "NY", sat: 1200 });
  assert.equal(classifyAcademicFit(profile, inState), classifyAcademicFit(profile, outState)); // same range
  assert.notEqual(scorePreferences(profile, inState).total, scorePreferences(profile, outState).total); // different fit
});

test("balanced selection fills missing category slots to reach nine", () => {
  const make = (n, category) => Array.from({ length: n }, (_, i) => ({ id: `${category}${i}`, category, matchScore: 100 - i }));
  const colleges = [...make(1, "Reach"), ...make(1, "Target"), ...make(10, "Likely")];
  const selected = selectBalancedList(colleges, 9);
  assert.equal(selected.length, 9);
  assert.ok(selected.some(c => c.category === "Reach"));
  assert.ok(selected.filter(c => c.category === "Likely").length >= 3);
});

test("fills missing category slots with the next highest-ranked colleges", () => {
  const c = (id, category, matchScore) => ({ id, category, matchScore });
  const colleges = [
    c("r1", "Reach", 95), c("r2", "Reach", 90), c("r3", "Reach", 85), c("r4", "Reach", 80),
    c("t1", "Target", 75), c("t2", "Target", 70)
  ];
  const selected = selectBalancedList(colleges, 5);
  assert.equal(selected.length, 5);
  // 3 Reach, both Targets — no Likely exists, so the 5th slot is the next best overall
  assert.deepEqual(selected.map(x => x.id), ["r1", "r2", "r3", "t1", "t2"]);
});

test("eligibility rejects non-operating or non-bachelor's institutions", () => {
  assert.equal(isEligibleCollege(college()), true);
  assert.equal(isEligibleCollege(college({ offersBachelors: false })), false);
  assert.equal(isEligibleCollege(college({ isOperating: false })), false);
});
