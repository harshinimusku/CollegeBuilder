const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

// Second Gemini call: write explanations for the already-selected colleges.
// Gemini only explains — it cannot add, remove, reorder, or re-categorize.
// We send the selected colleges, then validate the returned IDs match exactly.
// Returns the description of the college { overview, strategyNotes, colleges: [{ id, whyFit, watchOut }] }
export async function writeNarratives(profile, colleges, config) {
  const expectedIds = colleges.map(c => c.id);
  try {
    const raw = await geminiJson({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      schema: NARRATIVE_SCHEMA,
      temperature: 0.15,
      systemInstruction: [
        "You assist a college counselor by writing copy for an ALREADY-CHOSEN college list.",
        "Return exactly one item for every supplied college id, and no other ids.",
        "Do not add, remove, reorder, or re-categorize colleges.",
        "Do not invent programs, tuition, net price, admission stats, or rankings; use only supplied facts.",
        "Write concise, student-facing language. why_fit and watch_out are one short sentence each.",
        "Make no admission guarantees."
      ].join(" "),
      input: JSON.stringify({ profile, colleges: colleges.map(compactCollege) })
    });

    const returnedIds = (raw.colleges ?? []).map(c => String(c.id));
    if (!sameIdsInOrder(expectedIds, returnedIds)) return null;

    return {
      overview: raw.overview,
      strategyNotes: raw.strategy_notes,
      colleges: raw.colleges.map(c => ({ id: String(c.id), whyFit: c.why_fit, watchOut: c.watch_out }))
    };
  } catch (error) {
    console.warn(`Gemini narrative call failed: ${error.message}`);
    return null;
  }
}

// Describe one college a counselor manually added. Returns { whyFit, watchOut }
// from Gemini, or null on failure (the caller falls back to a template).
export async function describeCollege(profile, college, config) {
  try {
    const raw = await geminiJson({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      schema: DESCRIBE_SCHEMA,
      temperature: 0.2,
      systemInstruction: [
        "A counselor manually added ONE college to a student's list. Write concise, student-facing copy for it.",
        "Return one short why_fit sentence and one short watch_out sentence.",
        "Use only the supplied facts; do not invent programs, costs, admission stats, or rankings. No admission guarantees."
      ].join(" "),
      input: JSON.stringify({ profile, college: compactCollege(college) })
    });
    return { whyFit: raw.why_fit, watchOut: raw.watch_out };
  } catch (error) {
    console.warn(`Gemini describe call failed: ${error.message}`);
    return null;
  }
}

//Gemini API call
export async function geminiJson({ apiKey, model, systemInstruction, input, schema, temperature = 0.2 }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model,
      system_instruction: systemInstruction,
      input,
      generation_config: { temperature, thinking_level: "low" },
      response_format: { type: "text", mime_type: "application/json", schema }
    })
  });

  const rawText = await response.text();
  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = { raw: rawText };
  }

  if (!response.ok) {
    throw new Error(`Gemini API error: ${payload?.error?.message || payload?.raw || `HTTP ${response.status}`}`);
  }
  return parseJsonText(extractOutputText(payload));
}

// --- helpers ---------------------------------------------------------------

// makes sure the same ids are returned and in the same order
function sameIdsInOrder(expected, returned) {
  return expected.length === returned.length && expected.every((id, index) => String(id) === String(returned[index]));
}

// Only verified public facts go to the model.
function compactCollege(c) {
  return {
    id: c.id, name: c.name, city: c.city, state: c.state, category: c.category, match_score: c.matchScore,
    admission_rate: c.admissionRate, average_sat: c.sat, average_net_price: c.netPrice,
    size: c.size, setting: c.setting, offers_requested_major: (c.programs ?? []).length > 0
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  for (const step of payload?.steps ?? []) {
    if (step?.type !== "model_output") continue;
    for (const item of step.content ?? []) {
      if (item?.type === "text" && typeof item.text === "string") chunks.push(item.text);
    }
  }
  return chunks.join("\n");
}

function parseJsonText(text) {
  const clean = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!clean) throw new Error("Gemini returned no text output.");
  try {
    return JSON.parse(clean);
  } catch (error) {
    throw new Error(`Gemini returned invalid JSON: ${error.message}`);
  }
}

const DESCRIBE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    why_fit: { type: "string" },
    watch_out: { type: "string" }
  },
  required: ["why_fit", "watch_out"]
};

const NARRATIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string" },
    strategy_notes: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
    colleges: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          why_fit: { type: "string" },
          watch_out: { type: "string" }
        },
        required: ["id", "why_fit", "watch_out"]
      }
    }
  },
  required: ["overview", "strategy_notes", "colleges"]
};
