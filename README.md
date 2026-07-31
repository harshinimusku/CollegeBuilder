# College List Builder

A React frontend and Node.js backend that turns a counselor's student input — either a free-form description or a structured form — into a college list and a downloadable PDF.

The app uses:

- **React** (function components + hooks) for the browser UI and state-driven rendering.
- **Javascript** 
- **Vite** for the frontend development server and production build.
- **Node.js `node:http`** for the backend API and production static-file server.
- **College Scorecard** for the real college data and public metrics.
- **Gemini** for reading free-text descriptions and writing concise fit copy.

## Run locally

Requirements: Node.js 20.19 or newer.

```bash
cp .env.example .env
npm install
npm run dev
```

Development uses two local processes:

- React/Vite frontend: `http://localhost:5173`
- Node API: `http://localhost:3000`

Vite proxies `/api/*` requests to the Node server, so the frontend uses normal relative URLs such as `/api/generate`.

## Production-style run

```bash
npm install
npm run build
npm start
```

`npm run build` creates `dist/`. The Node server serves that compiled React app and the API from `http://localhost:3000`.

## Environment

College Scorecard is the main data source:

```dotenv
COLLEGE_SCORECARD_API_KEY=your_data_gov_key
```

Gemini is used for free-text parsing:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
```

When configured, Gemini has two uses:

1. Convert a free-form counselor description into a student profile.
2. Write explanations for the nine colleges already selected

Gemini does **not** choose, add, remove, reorder, score, or classify colleges. If the narrative call fails or returns colleges in the wrong order, the app uses deterministic template explanations.
## Environment variables

Create a local `.env` file in the project root before starting the application.

You can copy the provided template:

```bash
cp .env.example .env
```

Then add your API keys:

```env
# Free Gemini API key used to interpret free-form student descriptions
GEMINI_API_KEY=

# Gemini model used by the application
GEMINI_MODEL=gemini-3.6-flash

# Free data.gov API key used to access College Scorecard data
COLLEGE_SCORECARD_API_KEY=

# Local server port
PORT=3000
```

### Getting the API keys

* `GEMINI_API_KEY`: Create a free Gemini API key through Google AI Studio.
* `COLLEGE_SCORECARD_API_KEY`: Request a free data.gov API key for the College Scorecard API.

## Frontend structure

Most of the UI lives in a single component. React is kept for state/hooks; the markup is plain JSX.

```text
src/
  api/
    collegeApi.js        HTTP calls to the backend
  hooks/
    useCollegeList.js    request lifecycle and application state
  App.jsx                the whole interface (header, form, results, cards, add/remove)
  App.test.jsx           frontend tests (Vitest + React Testing Library)
  main.jsx               React root
  styles.css             application styling
```

## Backend structure

```text
config.js                environment loading and configuration
server.js                routing, the one recommendation pipeline, static serving, startup
lib/
  profile.js             free text (Gemini) or form -> one normalized profile
  scorecard.js           choose states, fetch multiple states, expand once, normalize, dedupe, name search
  matcher.js             eligibility, Reach/Target/Likely, preference scoring, balanced top 9, fallback copy
  gemini.js              Gemini API client + the validated narrative call
  pdf.js                 render a final result to a PDF buffer
```

## Request flow

1. The counselor either writes a free-text description or fills the structured form in `App.jsx`.
2. `useCollegeList` calls `POST /api/generate` through `collegeApi.js`.
3. The server builds one normalized profile — from the form (deterministic) or from the description (Gemini).
4. `scorecard.js` fetches a broad candidate pool across several states (concurrently), expanding the geography once if the pool is small, then dedupes.
5. `matcher.js` drops ineligible institutions (not operating / not bachelor's / not main campus) — preferences are **not** hard filters.
6. Every remaining college gets a deterministic preference `matchScore` (with a breakdown) and a separate Reach/Target/Likely `category`.
7. `matcher.js` selects a balanced top 9; Gemini then writes copy for exactly those schools (validated by ID) — it cannot add, drop, or re-order them.
8. `App.jsx` renders the result; the counselor can remove suggested colleges or search-and-add their own.
9. PDF export sends the current list to `POST /api/pdf`, which only validates and renders it.

## Matching model

The backend scores preferences using a fixed 100-point system, so every `matchScore` is explainable from a table (and the breakdown is shown on each college card):

| Signal | Maximum points |
|---|---:|
| Intended major | 30 |
| Academic outcomes | 25 |
| Location | 20 |
| Affordability | 10 |
| School size | 5 |
| Campus setting | 5 |
| Public/private preference | 5 |

Reach, Target, and Likely are calculated **separately** from the preference score — the category answers "how academically ambitious is this college for the student?" and is not an admission prediction.

## Commands

```bash
npm run dev        # Vite frontend and watched Node API
npm run build      # Build the React frontend
npm start          # Serve the built frontend and API
npm test           # Backend unit tests (node --test)
npm run test:web   # Frontend tests (Vitest + React Testing Library)
```

## Verification

The project is checked with:

```bash
npm run check
```

This runs the production build, backend tests, and frontend tests.

## Known limitations

- GPA does not currently affect the ranking (SAT and admit rate drive the Reach/Target/Likely split).
- Location is scored only by state.
- Major matching uses broad two-digit CIP families, not guaranteed exact degree names.
- If the primary states return too few colleges, the geography is broadened once; the scoring preferences are never weakened.
- Reach/Target/Likely is a planning heuristic, not an admissions probability model.
