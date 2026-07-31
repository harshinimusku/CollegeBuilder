import { useEffect, useMemo, useRef, useState } from "react";
import { useCollegeList } from "./hooks/useCollegeList";
import { searchColleges } from "./api/collegeApi";

// The whole screen is one component. The server-side workflow and app state live in the useCollegeList hook; this file is the markup plus a little local

const CATEGORIES = ["Reach", "Target", "Likely"];

const EXAMPLES = [
  { label: "Programming + practical", description: "A student from Pennsylvania who loves programming and project-based work. SAT 1230, GPA 3.5, with strong AP Computer Science and Calculus scores. Wants practical, hands-on schools within a few hundred miles of home." },
  { label: "Marine biology + aid", description: "A quiet student deeply interested in marine biology. Middling test scores but a compelling personal story. High financial-aid need, and a warm coastal location would be a plus." },
  { label: "Psychology + research", description: "A student from Illinois with a 1380 SAT and 3.8 GPA, interested in psychology and research. Prefers a medium-size college in or near a city, with a balanced list and strong affordability options." }
];

const MAJOR_OPTIONS = [
  { code: "01", label: "Agriculture" }, { code: "04", label: "Architecture" }, { code: "26", label: "Biological sciences" },
  { code: "52", label: "Business" }, { code: "09", label: "Communication & journalism" }, { code: "10", label: "Communications technology" },
  { code: "11", label: "Computer science" }, { code: "46", label: "Construction trades" }, { code: "12", label: "Culinary & personal services" },
  { code: "13", label: "Education" }, { code: "14", label: "Engineering" }, { code: "15", label: "Engineering technology" },
  { code: "23", label: "English & literature" }, { code: "03", label: "Environmental / natural resources" }, { code: "05", label: "Ethnic, cultural & gender studies" },
  { code: "19", label: "Family & consumer sciences" }, { code: "16", label: "Foreign languages & linguistics" }, { code: "51", label: "Health professions" },
  { code: "54", label: "History" }, { code: "43", label: "Homeland security & law enforcement" }, { code: "22", label: "Legal & paralegal studies" },
  { code: "24", label: "Liberal arts & humanities" }, { code: "25", label: "Library science" }, { code: "27", label: "Mathematics & statistics" },
  { code: "47", label: "Mechanic & repair technologies" }, { code: "29", label: "Military technologies" }, { code: "30", label: "Multi / interdisciplinary studies" },
  { code: "31", label: "Parks, recreation & fitness" }, { code: "38", label: "Philosophy & religious studies" }, { code: "40", label: "Physical sciences" },
  { code: "48", label: "Precision production" }, { code: "42", label: "Psychology" }, { code: "44", label: "Public administration & social service" },
  { code: "41", label: "Science technologies" }, { code: "45", label: "Social sciences" }, { code: "39", label: "Theology & religious vocations" },
  { code: "49", label: "Transportation" }, { code: "50", label: "Visual & performing arts" }
];

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"],
  ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"]
];

const EMPTY_FORM = {
  student_name: "", cip: "", home_state: "", preferred_states: "", sat: "", gpa: "",
  max_distance_miles: "", school_size: "any", setting: "any", school_type: "any", financial_aid_need: "medium", climate: "any"
};

// Display helpers. Each returns "Not reported" rather than a blank when a Scorecard field is missing, so cards never show empty values.
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const isNum = v => typeof v === "number" && Number.isFinite(v);
const fmtMoney = v => (isNum(v) ? money.format(v) : "Not reported");
const fmtPct = v => (isNum(v) ? `${Math.round(v * 100)}%` : "Not reported");
const fmtNum = v => (isNum(v) ? Math.round(v).toLocaleString("en-US") : "Not reported");

function readablePreference(value) {
  if (!value || value === "any") return null;
  return value.replaceAll("_", " ");
}

// Friendly labels for the score-breakdown rows.
const SCORE_LABELS = {
  major: "Major",
  academics: "Academic outcomes",
  location: "Location",
  affordability: "Affordability",
  size: "School size",
  setting: "Campus setting",
  ownership: "College type"
};
function scoreLabel(key) {
  return SCORE_LABELS[key] ?? key;
}

function profileItems(result) {
  const p = result.profile;
  const markers = [p.sat ? `SAT ${p.sat}` : null, p.gpa ? `GPA ${p.gpa}` : null].filter(Boolean).join(" · ");
  const filters = [
    readablePreference(p.ownershipPreference),
    p.sizePreference && p.sizePreference !== "any" ? `${p.sizePreference} size` : null,
    readablePreference(p.settingPreference)
  ].filter(Boolean).join(" · ");

  return [
    { label: "Academic interests", value: p.majors?.join(", ") },
    { label: "Academic markers", value: markers },
    { label: "Home state", value: p.homeState || "" },
    { label: "Preferred states", value: p.preferredStates?.join(", ") },
    { label: "School filters", value: filters },
    { label: "Aid priority", value: p.financialAidNeed }
  ].filter(item => item.value);
}

export default function App() {
  const app = useCollegeList();
  const { result } = app;

  // Local view state only — anything that talks to the server is in the hook.
  const [mode, setMode] = useState("text");     // "text" (free-form) or "form"
  const [form, setForm] = useState(EMPTY_FORM);
  const setField = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  // The add-a-college search box manages its own little request cycle.
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchError, setSearchError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [addingId, setAddingId] = useState(null);

  const grouped = useMemo(
    () => Object.fromEntries(CATEGORIES.map(c => [c, result ? result.colleges.filter(x => x.category === c) : []])),
    [result]
  );
  const existingIds = useMemo(() => new Set(result ? result.colleges.map(c => c.id) : []), [result]);

  // Scroll the results into view when a new list comes back (keyed on id so
  // editing the current list doesn't re-scroll).
  const resultsRef = useRef(null);
  useEffect(() => {
    if (result) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result?.generatedAt]);

  const handleTextSubmit = event => {
    event.preventDefault();
    void app.generate();
  };

  const handleFormSubmit = event => {
    event.preventDefault();
    const label = MAJOR_OPTIONS.find(option => option.code === form.cip)?.label;
    void app.generateFromForm({
      student_name: form.student_name || undefined,
      cip_codes: form.cip ? [form.cip] : [],
      majors: label ? [label] : [],
      home_state: form.home_state,
      preferred_states: form.preferred_states,
      sat: form.sat,
      gpa: form.gpa,
      max_distance_miles: form.max_distance_miles,
      school_size: form.school_size,
      setting: form.setting,
      school_type: form.school_type,
      financial_aid_need: form.financial_aid_need,
      climate: form.climate
    });
  };

  const canSubmitForm = Boolean(form.cip || form.home_state.trim() || form.preferred_states.trim() || form.sat.trim());

  const runSearch = async event => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchError("Enter at least 2 characters.");
      return;
    }
    setSearchStatus("searching");
    setSearchError(null);
    try {
      const matches = await searchColleges(trimmed, result.profile);
      setSearchResults(matches);
      setSearched(true);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
      setSearchResults([]);
    } finally {
      setSearchStatus("idle");
    }
  };

  const resultTitle = result?.profile.studentName ? `${result.profile.studentName}'s college list` : "College recommendations";

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="College List Builder home">
          <span className="brand-mark">CL</span>
          <span>College List Builder</span>
        </a>
      </header>

      <main>
        <section className="hero">
          <h1>Build a balanced college list.</h1>
          <p>Describe a student and get a ranked shortlist from real College Scorecard data.</p>
        </section>

        {/* input card */}
        <section className="workspace card">
          <div className="mode-toggle" role="tablist" aria-label="Input mode">
            <button type="button" role="tab" aria-selected={mode === "text"} className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>Describe in words</button>
            <button type="button" role="tab" aria-selected={mode === "form"} className={mode === "form" ? "active" : ""} onClick={() => setMode("form")}>Fill in a form</button>
          </div>

          {mode === "text" ? (
            <form onSubmit={handleTextSubmit}>
              <div className="field-header">
                <label htmlFor="description">Describe the student</label>
                <span>{app.description.length.toLocaleString()} / 6,000</span>
              </div>
              <textarea
                id="description"
                maxLength={6000}
                minLength={20}
                required
                value={app.description}
                onChange={event => app.setDescription(event.target.value)}
                placeholder="Example: Quiet student interested in marine biology, middling test scores but a strong story. Needs financial aid. Somewhere warm would be a plus."
              />
              <div className="examples" aria-label="Example prompts">
                {EXAMPLES.map(example => (
                  <button key={example.label} type="button" className="example-chip" onClick={() => app.setDescription(example.description)}>{example.label}</button>
                ))}
              </div>
              <div className="form-footer">
                <button className="primary-button" type="submit" disabled={app.isGenerating || app.description.trim().length < 20}>
                  <span>{app.isGenerating ? "Generating…" : "Generate list"}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleFormSubmit}>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="f-cip">Primary interest</label>
                  <select id="f-cip" value={form.cip} onChange={setField("cip")}>
                    <option value="">No preference</option>
                    {MAJOR_OPTIONS.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="f-home">Home state</label>
                  <select id="f-home" value={form.home_state} onChange={setField("home_state")}>
                    <option value="">No preference</option>
                    {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="f-pref">Target states</label>
                  <input id="f-pref" type="text" placeholder="e.g. IL, WI (optional)" value={form.preferred_states} onChange={setField("preferred_states")} />
                </div>
                <div className="form-field">
                  <label htmlFor="f-sat">SAT</label>
                  <input id="f-sat" type="number" min={400} max={1600} placeholder="400–1600" value={form.sat} onChange={setField("sat")} />
                </div>
                <div className="form-field">
                  <label htmlFor="f-gpa">GPA</label>
                  <input id="f-gpa" type="number" min={0} max={5} step={0.1} placeholder="0–5" value={form.gpa} onChange={setField("gpa")} />
                </div>
                <div className="form-field">
                  <label htmlFor="f-dist">Max distance (mi)</label>
                  <input id="f-dist" type="number" min={25} max={3500} placeholder="Optional" value={form.max_distance_miles} onChange={setField("max_distance_miles")} />
                </div>
                <div className="form-field">
                  <label htmlFor="f-size">School size</label>
                  <select id="f-size" value={form.school_size} onChange={setField("school_size")}>
                    <option value="any">Any</option>
                    <option value="small">Small (&lt;5k)</option>
                    <option value="medium">Medium (5k–15k)</option>
                    <option value="large">Large (&gt;15k)</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="f-setting">Setting</label>
                  <select id="f-setting" value={form.setting} onChange={setField("setting")}>
                    <option value="any">Any</option>
                    <option value="urban">Urban</option>
                    <option value="suburban">Suburban</option>
                    <option value="town">Town</option>
                    <option value="rural">Rural</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="f-type">School type</label>
                  <select id="f-type" value={form.school_type} onChange={setField("school_type")}>
                    <option value="any">Any</option>
                    <option value="public">Public</option>
                    <option value="private_nonprofit">Private (nonprofit)</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="f-aid">Financial-aid need</label>
                  <select id="f-aid" value={form.financial_aid_need} onChange={setField("financial_aid_need")}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="f-climate">Climate</label>
                  <select id="f-climate" value={form.climate} onChange={setField("climate")}>
                    <option value="any">Any</option>
                    <option value="warm">Warm</option>
                    <option value="cool">Cool</option>
                    <option value="four_seasons">Four seasons</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="f-name">Student name</label>
                  <input id="f-name" type="text" placeholder="Optional" value={form.student_name} onChange={setField("student_name")} />
                </div>
              </div>
              <div className="form-footer">
                <button className="primary-button" type="submit" disabled={app.isGenerating || !canSubmitForm}>
                  <span>{app.isGenerating ? "Generating…" : "Generate list"}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          )}
        </section>

        {/* loading */}
        {app.isGenerating && (
          <section className="loading-panel card" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <div>
              <strong>Building the list…</strong>
              <p>{app.loadingMessage}</p>
            </div>
          </section>
        )}

        {/* error */}
        {app.error && <section className="error-panel" role="alert">{app.error}</section>}

        {/* results */}
        {result && (
          <section className="results" aria-live="polite" ref={resultsRef}>
            <div className="results-header">
              <div>
                <h2>{resultTitle}</h2>
                <p>{result.overview}</p>
              </div>
              <button className="secondary-button" type="button" disabled={app.isDownloading} onClick={() => void app.downloadPdf()}>
                {app.isDownloading ? "Preparing PDF…" : "Download PDF"}
              </button>
            </div>

            {(result.warnings?.length ?? 0) > 0 && <div className="warning-box">{result.warnings.join(" ")}</div>}

            <div className="profile-grid">
              {profileItems(result).map(item => (
                <div className="profile-item" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

            <div className="notes card">
              <h3>How to use this list</h3>
              <ul>
                <li>This is a starting point. Remove any college that isn't a fit with the <strong>Remove</strong> button on its card.</li>
                <li>Add your own colleges in the <strong>Add a college</strong> box below — each school's real details are looked up and filled in for you automatically.</li>
                <li>Reach, Target, and Likely are planning labels, not admission predictions. Confirm specifics with each college.</li>
              </ul>
            </div>

            {CATEGORIES.map(category => {
              const group = grouped[category];
              if (!group.length) return null;
              return (
                <section className="group" key={category}>
                  <div className="group-title">
                    <h3>{category}</h3>
                    <span className="group-count">{group.length} school{group.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="college-grid">
                    {group.map(college => (
                      <article className="college-card card" data-category={college.category} key={college.id}>
                        <div className="college-top">
                          <div>
                            <h4 className="college-name">
                              {college.name}
                              {college.manual && <span className="added-tag">Added</span>}
                            </h4>
                            <div className="location">{college.city}, {college.state}</div>
                          </div>
                          <div className="college-top-right">
                            <span className={`badge ${college.category.toLowerCase()}`}>{college.category}</span>
                            <button type="button" className="remove-college" aria-label={`Remove ${college.name} from the list`} title="Remove from list" onClick={() => app.removeCollege(college.id)}>Remove</button>
                          </div>
                        </div>
                        <div className="metrics">
                          <div className={`metric${college.scoreBreakdown ? " metric-match" : ""}`} tabIndex={college.scoreBreakdown ? 0 : undefined}>
                            <span>Match</span>
                            <strong>{college.matchScore}/100</strong>
                            {college.scoreBreakdown && (
                              <div className="score-tooltip" role="tooltip">
                                <div className="score-tooltip-title">Score breakdown</div>
                                <dl>
                                  {Object.entries(college.scoreBreakdown).map(([label, points]) => (
                                    <div key={label}><dt>{scoreLabel(label)}</dt><dd>{points}</dd></div>
                                  ))}
                                  <div className="score-total"><dt>Total</dt><dd>{college.matchScore}/100</dd></div>
                                </dl>
                              </div>
                            )}
                          </div>
                          <div className="metric"><span>Admit rate</span><strong>{fmtPct(college.admissionRate)}</strong></div>
                          <div className="metric"><span>Average SAT</span><strong>{fmtNum(college.sat)}</strong></div>
                          <div className="metric"><span>Avg net price</span><strong>{fmtMoney(college.netPrice)}</strong></div>
                        </div>
                        <p className="fit-copy"><strong>Why it fits:</strong> {college.whyFit}</p>
                        <p className="check-copy"><strong>Verify:</strong> {college.watchOut}</p>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* add a college */}
            <section className="add-college card">
              <div className="add-college-head">
                <h3>Add a college</h3>
                <p>Search College Scorecard by name. Added schools use real, pulled metrics and are scored against this profile.</p>
              </div>
              <form className="add-college-form" onSubmit={runSearch}>
                <input type="text" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. Stevens Institute of Technology" aria-label="College name to search" />
                <button type="submit" className="secondary-button" disabled={searchStatus === "searching"}>{searchStatus === "searching" ? "Searching…" : "Search"}</button>
              </form>
              {searchError && <p className="add-college-error">{searchError}</p>}
              {searched && !searchError && searchResults.length === 0 && searchStatus === "idle" && (
                <p className="add-college-empty">No colleges matched that name. Try a fuller or different spelling.</p>
              )}
              {searchResults.length > 0 && (
                <ul className="add-college-results">
                  {searchResults.map(college => {
                    const already = existingIds.has(college.id);
                    const adding = addingId === college.id;
                    return (
                      <li key={college.id}>
                        <div className="add-college-info">
                          <strong>{college.name}</strong>
                          <span>{college.city}, {college.state} · {isNum(college.admissionRate) ? `${Math.round(college.admissionRate * 100)}% admit` : "Admit n/a"} · {college.category} · match {college.matchScore}/100</span>
                        </div>
                        <button
                          type="button"
                          className="add-college-button"
                          disabled={already || adding}
                          onClick={async () => { setAddingId(college.id); await app.addCollege(college); setAddingId(null); }}
                        >
                          {already ? "Added" : adding ? "Adding…" : "Add"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className="disclaimer card">
              <strong>Important:</strong> <span>{result.disclaimer}</span>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
