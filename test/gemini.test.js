import test from "node:test";
import assert from "node:assert/strict";
import { writeNarratives, describeCollege } from "../lib/gemini.js";

const config = { geminiApiKey: "KEY", geminiModel: "model" };
const selected = [
  { id: "1", name: "A", city: "C", state: "CA", category: "Reach", matchScore: 80, programs: [] },
  { id: "2", name: "B", city: "C", state: "CA", category: "Target", matchScore: 70, programs: [] }
];

// Fake a Gemini HTTP response whose output_text is the given narrative object.
function mockGemini(narrative) {
  return async () => ({ ok: true, text: async () => JSON.stringify({ output_text: JSON.stringify(narrative) }) });
}

function withMockFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve().then(run).finally(() => { globalThis.fetch = original; });
}

test("writeNarratives returns explanations when the ids match the selection", async () => {
  await withMockFetch(mockGemini({
    overview: "o", strategy_notes: ["a", "b"],
    colleges: [{ id: "1", why_fit: "w1", watch_out: "c1" }, { id: "2", why_fit: "w2", watch_out: "c2" }]
  }), async () => {
    const narrative = await writeNarratives({}, selected, config);
    assert.equal(narrative.overview, "o");
    assert.equal(narrative.colleges.length, 2);
    assert.equal(narrative.colleges[0].whyFit, "w1");
  });
});

test("writeNarratives returns null when Gemini changes the college ids", async () => {
  await withMockFetch(mockGemini({
    overview: "o", strategy_notes: ["a", "b"],
    colleges: [{ id: "999", why_fit: "w", watch_out: "c" }]
  }), async () => {
    assert.equal(await writeNarratives({}, selected, config), null);
  });
});

test("writeNarratives rejects reordered ids (order is part of the contract)", async () => {
  await withMockFetch(mockGemini({
    overview: "o", strategy_notes: ["a", "b"],
    // same ids as `selected` (1, 2) but reversed order
    colleges: [{ id: "2", why_fit: "w2", watch_out: "c2" }, { id: "1", why_fit: "w1", watch_out: "c1" }]
  }), async () => {
    assert.equal(await writeNarratives({}, selected, config), null);
  });
});

test("writeNarratives returns null on a failed call (so the server falls back)", async () => {
  await withMockFetch(async () => ({ ok: false, status: 500, text: async () => "quota" }), async () => {
    assert.equal(await writeNarratives({}, selected, config), null);
  });
});

test("describeCollege returns why-fit / watch-out for one added college", async () => {
  await withMockFetch(mockGemini({ why_fit: "Fits the major.", watch_out: "Very selective." }), async () => {
    const description = await describeCollege({}, selected[0], config);
    assert.deepEqual(description, { whyFit: "Fits the major.", watchOut: "Very selective." });
  });
});

test("describeCollege returns null on failure (server falls back to a template)", async () => {
  await withMockFetch(async () => ({ ok: false, status: 500, text: async () => "quota" }), async () => {
    assert.equal(await describeCollege({}, selected[0], config), null);
  });
});
