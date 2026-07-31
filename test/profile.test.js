import test from "node:test";
import assert from "node:assert/strict";
import { profileFromForm, normalizeProfile } from "../lib/profile.js";

test("form and free-form inputs normalize to the same profile shape", () => {
  const fromForm = profileFromForm({
    cip_codes: ["11"], majors: ["Computer science"], home_state: "il", preferred_states: "CA, OR",
    sat: "1380", gpa: "3.8", school_type: "public", school_size: "medium", setting: "urban"
  });
  const fromGemini = normalizeProfile({
    cip_codes: ["11"], majors: ["Computer science"], home_state: "IL", preferred_states: ["CA", "OR"],
    sat: 1380, gpa: 3.8, school_type: "public", school_size: "medium", setting: "urban"
  });
  assert.deepEqual(Object.keys(fromForm).sort(), Object.keys(fromGemini).sort());
  assert.deepEqual(fromForm, fromGemini);
});

test("normalizeProfile validates, clamps, and applies defaults", () => {
  const p = normalizeProfile({ sat: "", gpa: "", home_state: "illinois", preferred_states: "" });
  assert.equal(p.sat, null);
  assert.equal(p.gpa, null);
  assert.equal(p.homeState, "IL");
  assert.deepEqual(p.preferredStates, []);
  assert.equal(p.financialAidNeed, "medium");
  assert.equal(p.sizePreference, "any");
  assert.equal(p.climatePreference, "any");
});
