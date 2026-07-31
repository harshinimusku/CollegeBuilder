import test from "node:test";
import assert from "node:assert/strict";
import { choosePrimaryStates, fetchCandidates, searchByName, MIN_CANDIDATE_POOL } from "../lib/scorecard.js";

// A raw College Scorecard row (what the API returns before normalization).
function row(id, name, state) {
  return {
    id, "school.name": name, "school.city": "City", "school.state": state,
    "school.ownership": 1, "school.locale": 11, "school.operating": 1,
    "school.main_campus": 1, "school.degrees_awarded.predominant": 3, "latest.student.size": 9000
  };
}

function withMockFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async url => handler(new URL(url));
  return Promise.resolve().then(run).finally(() => { globalThis.fetch = original; });
}

test("choosePrimaryStates prefers explicit states", () => {
  const states = choosePrimaryStates({ preferredStates: ["CA", "OR"], climatePreference: "any", homeState: "IL" });
  assert.deepEqual(states, ["CA", "OR"]);
});

test("choosePrimaryStates falls back to home state and neighbors", () => {
  const states = choosePrimaryStates({ preferredStates: [], climatePreference: "any", homeState: "PA" });
  assert.ok(states.includes("PA"));
  assert.ok(states.length > 1);
});

test("combines and dedupes across states; one failed state does not fail the request", async () => {
  await withMockFetch(url => {
    const state = url.searchParams.get("school.state");
    if (state === "NY") return { ok: false, status: 500, text: async () => "boom" };
    const results = state === "CA" ? [row("1", "Alpha", "CA"), row("2", "Beta", "CA")] : [row("1", "Alpha", "CA")];
    return { ok: true, json: async () => ({ results }) };
  }, async () => {
    const profile = { preferredStates: ["CA", "NY", "PA"], climatePreference: "any", homeState: null, cipCodes: [] };
    const { colleges } = await fetchCandidates(profile, "KEY");
    assert.deepEqual(colleges.map(c => c.id).sort(), ["1", "2"]);
  });
});

test("geographic expansion only happens when the pool is too small", async () => {
  const queried = new Set();
  await withMockFetch(url => {
    queried.add(url.searchParams.get("school.state"));
    const results = Array.from({ length: MIN_CANDIDATE_POOL + 5 }, (_, i) => row(String(i), `C${i}`, "CA"));
    return { ok: true, json: async () => ({ results }) };
  }, async () => {
    const profile = { preferredStates: ["CA"], climatePreference: "any", homeState: null, cipCodes: [] };
    const { colleges } = await fetchCandidates(profile, "KEY");
    assert.ok(colleges.length >= MIN_CANDIDATE_POOL);
    assert.deepEqual([...queried], ["CA"]); // no expansion states were queried
  });
});

test("searchByName returns normalized, deduped, capped results", async () => {
  await withMockFetch(() => ({
    ok: true,
    json: async () => ({ results: [row("1", "Alpha", "CA"), row("1", "Alpha", "CA"), row("2", "Beta", "NY")] })
  }), async () => {
    const results = await searchByName("alpha", "KEY", []);
    assert.equal(results.length, 2);
    assert.equal(results[0].name, "Alpha");
    assert.equal(results[0].setting, "urban");
    assert.equal(results[0].isMainCampus, true);
  });
});
