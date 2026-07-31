import test from "node:test";
import assert from "node:assert/strict";
import { buildPdf } from "../lib/pdf.js";

test("buildPdf renders a final result into a valid PDF buffer", () => {
  const result = {
    generatedAt: new Date().toISOString(),
    profile: { studentName: "Demo Student", majors: ["Biology"], sat: 1180, gpa: 3.4, homeState: "PA", financialAidNeed: "high" },
    overview: "Demo overview",
    strategyNotes: ["Verify all facts."],
    disclaimer: "Preliminary aid only.",
    colleges: [
      { id: "1", name: "Demo University", city: "Town", state: "PA", category: "Target", matchScore: 72,
        admissionRate: 0.5, sat: 1200, netPrice: 18000, size: 9000, setting: "urban", ownership: 1,
        whyFit: "Good fit.", watchOut: "Verify." }
    ]
  };
  const pdf = buildPdf(result);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.ok(pdf.toString("latin1").endsWith("%%EOF\n"));
  assert.ok(pdf.length > 1000);
});
