import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { profileFromForm, profileFromGemini } from "./lib/profile.js";
import { fetchCandidates, searchByName } from "./lib/scorecard.js";
import { isEligibleCollege, classifyAcademicFit, scorePreferences, selectBalancedList, deterministicNarratives, describeCollegeFallback } from "./lib/matcher.js";
import { writeNarratives, describeCollege } from "./lib/gemini.js";
import { buildPdf } from "./lib/pdf.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "dist");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

// Error that carries an HTTP status. Anything thrown without one is treated
// as an unexpected 500 in the request handler below.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

async function readJson(req, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, "Request is too large.");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sanitizeDescription(value) {
  const description = String(value ?? "").trim();
  if (description.length < 20) throw new HttpError(400, "Please provide a fuller student description (at least 20 characters).");
  if (description.length > 6000) throw new HttpError(400, "Please keep the description under 6,000 characters.");
  return description;
}

// Both input modes produce the same normalized profile. Free text needs Gemini.
async function buildProfile({ description, form }) {
  if (form) return profileFromForm(form);
  if (!config.geminiApiKey) {
    throw new HttpError(503, "Free-text descriptions require Gemini. Add GEMINI_API_KEY, or use the structured form instead.");
  }
  try {
    return await profileFromGemini(description, config);
  } catch (error) {
    throw new HttpError(502, `Could not read the description (Gemini): ${error.message}`);
  }
}

// The one recommendation pipeline:
//   profile -> fetch broad pool -> drop ineligible -> score -> select 9 ->
//   ask Gemini to explain -> return. No filter relaxation, one obvious flow.
async function generateList({ description = null, form = null }) {
  const warnings = [];
  const profile = await buildProfile({ description, form });

  let pool;
  try {
    pool = await fetchCandidates(profile, config.scorecardApiKey);
  } catch (error) {
    throw new HttpError(502, `College Scorecard request failed: ${error.message}`);
  }

  const eligible = pool.colleges.filter(isEligibleCollege);
  if (!eligible.length) throw new HttpError(404, "No eligible colleges were found. Try a broader location or fewer constraints.");

  const scored = eligible.map(college => {
    const { total, breakdown } = scorePreferences(profile, college);
    return { ...college, category: classifyAcademicFit(profile, college), matchScore: total, scoreBreakdown: breakdown };
  });

  const selected = selectBalancedList(scored, 9);

  // Second Gemini call: explanations only. Falls back to templates on failure.
  let narrative = config.geminiApiKey ? await writeNarratives(profile, selected, config) : null;
  if (!narrative) {
    narrative = deterministicNarratives(profile, selected);
    if (config.geminiApiKey) warnings.push("AI-written summaries were unavailable, so standard descriptions are shown.");
  }

  const explanationById = new Map(narrative.colleges.map(c => [c.id, c]));
  const colleges = selected.map(college => {
    const explanation = explanationById.get(college.id);
    return { ...college, whyFit: explanation?.whyFit ?? "", watchOut: explanation?.watchOut ?? "" };
  });

  console.log(`Generated ${colleges.length} colleges from [${pool.states.join(", ")}]; ${JSON.stringify(countCategories(colleges))}`);

  return {
    generatedAt: new Date().toISOString(),
    profile,
    overview: narrative.overview,
    strategyNotes: narrative.strategyNotes,
    colleges,
    warnings,
    disclaimer: "Preliminary counseling aid only. Verify current admissions, programs, costs, deadlines, and financial aid with each institution."
  };
}

function countCategories(colleges) {
  return colleges.reduce((counts, c) => ({ ...counts, [c.category]: (counts[c.category] ?? 0) + 1 }), {});
}

// e.g. "John-Smith_college-list_07_31_2026.pdf". When no student name was given,
// the name slug falls back to "student".
function pdfFileName(result) {
  const slug = String(result.profile.studentName ?? "").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const name = slug || "student";
  const d = result.generatedAt ? new Date(result.generatedAt) : new Date();
  const date = `${String(d.getMonth() + 1).padStart(2, "0")}_${String(d.getDate()).padStart(2, "0")}_${d.getFullYear()}`;
  return `${name}_college-list_${date}.pdf`;
}

// A safe subset of a client-supplied profile for scoring manual search results.
function safeProfile(raw = {}) {
  return {
    cipCodes: Array.isArray(raw.cipCodes) ? raw.cipCodes : [],
    preferredStates: Array.isArray(raw.preferredStates) ? raw.preferredStates : [],
    homeState: raw.homeState ?? null,
    sat: Number.isFinite(raw.sat) ? raw.sat : null,
    financialAidNeed: raw.financialAidNeed ?? "medium",
    sizePreference: raw.sizePreference ?? "any",
    settingPreference: raw.settingPreference ?? "any",
    ownershipPreference: raw.ownershipPreference ?? "any"
  };
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return false;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-store"
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

// Tiny hand-rolled router: match method + path, else fall through to static
// files. One try/catch turns any thrown HttpError into the right status code.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        geminiConfigured: Boolean(config.geminiApiKey),
        scorecardKeyConfigured: Boolean(config.scorecardApiKey && config.scorecardApiKey !== "DEMO_KEY"),
        model: config.geminiApiKey ? config.geminiModel : "deterministic",
        dataSource: "college_scorecard"
      });
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJson(req);
      if (body.form && typeof body.form === "object") {
        const form = body.form;
        const hasDetail = [form.cip_codes, form.majors, form.preferred_states].some(v => (Array.isArray(v) ? v.length : String(v ?? "").trim()))
          || [form.home_state, form.sat].some(v => String(v ?? "").trim());
        if (!hasDetail) throw new HttpError(400, "Add at least one detail (an interest, a state, or test scores) to build a list.");
        const result = await generateList({ form });
        return sendJson(res, 200, result);
      }
      const description = sanitizeDescription(body.description);
      const result = await generateList({ description });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/colleges/search") {
      const body = await readJson(req);
      const query = String(body.query ?? "").trim();
      if (query.length < 2) throw new HttpError(400, "Enter at least 2 characters to search for a college.");
      const profile = safeProfile(body.profile);
      const matches = await searchByName(query, config.scorecardApiKey, profile.cipCodes);

      // Classify and score with the same functions, but skip eligibility/the
      // pipeline — a manual add is the counselor's explicit choice. Copy is a
      // template here; it gets a real description on add (see /describe).
      const colleges = matches.map(college => {
        const category = classifyAcademicFit(profile, college);
        const { total, breakdown } = scorePreferences(profile, college);
        return {
          ...college,
          category,
          matchScore: total,
          scoreBreakdown: breakdown,
          manual: true,
          ...describeCollegeFallback({ ...college, category })
        };
      });
      return sendJson(res, 200, { colleges });
    }

    if (req.method === "POST" && url.pathname === "/api/colleges/describe") {
      const body = await readJson(req);
      if (!body.college || typeof body.college !== "object") throw new HttpError(400, "A college is required.");
      const profile = safeProfile(body.profile);
      const description = (config.geminiApiKey && await describeCollege(profile, body.college, config)) || describeCollegeFallback(body.college);
      return sendJson(res, 200, description);
    }

    if (req.method === "POST" && url.pathname === "/api/pdf") {
      const result = await readJson(req, 2_000_000);
      if (!Array.isArray(result.colleges) || !result.profile) throw new HttpError(400, "Invalid college-list payload.");
      const pdf = buildPdf(result);
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": pdf.length,
        "content-disposition": `attachment; filename="${pdfFileName(result)}"`,
        "cache-control": "no-store"
      });
      return res.end(pdf);
    }

    if (req.method === "GET" && await serveStatic(req, res, url.pathname)) return;
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error); // log genuine server faults, not client mistakes
    sendJson(res, status, { error: error.message || "Unexpected server error" });
  }
});

server.listen(config.port, () => {
  console.log(`College List Builder API running at http://localhost:${config.port}`);
  console.log(`Data source: live College Scorecard. Free-text parsing: ${config.geminiApiKey ? "Gemini" : "disabled (use the form)"}.`);
  if (!existsSync(publicDir)) {
    console.warn("React production build not found. Run `npm run build`, or use `npm run dev` for development.");
  }
});
