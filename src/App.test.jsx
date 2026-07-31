import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import * as api from "./api/collegeApi";

// The API layer is the app's only outside dependency, so we mock it and drive
// the component the way a user would.
vi.mock("./api/collegeApi", () => ({
  fetchHealth: vi.fn(),
  generateCollegeList: vi.fn(),
  generateCollegeListFromForm: vi.fn(),
  searchColleges: vi.fn(),
  createCollegeListPdf: vi.fn()
}));

// A small but complete result the way /api/generate returns one.
function sampleResult() {
  const college = (id, name, category) => ({
    id, name, city: "Somewhere", state: "PA", category,
    matchScore: 60, admissionRate: 0.5, sat: 1200, netPrice: 20000,
    whyFit: "Fits the profile.", watchOut: "Verify details."
  });
  return {
    id: "r1",
    profile: { majors: ["Computer science"], sat: 1230, financial_aid_need: "medium" },
    overview: "A balanced starting list.",
    colleges: [
      college("1", "Reach University", "Reach"),
      college("2", "Target College", "Target"),
      college("3", "Likely State", "Likely")
    ],
    warnings: [],
    disclaimer: "Preliminary counseling aid only."
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchHealth.mockResolvedValue({ ok: true });
});

describe("College List Builder", () => {
  it("keeps Generate disabled until the description is long enough", async () => {
    const user = userEvent.setup();
    render(<App />);

    const generate = screen.getByRole("button", { name: /generate list/i });
    expect(generate).toBeDisabled();

    await user.type(screen.getByLabelText(/describe the student/i), "too short");
    expect(generate).toBeDisabled();

    await user.type(screen.getByLabelText(/describe the student/i), " but now this is plenty long");
    expect(generate).toBeEnabled();
  });

  it("shows the loading state, then renders the Reach/Target/Likely groups and the PDF button", async () => {
    const user = userEvent.setup();

    // Hold the request open so we can assert the loading state first.
    let resolveGenerate;
    api.generateCollegeList.mockReturnValue(new Promise(resolve => { resolveGenerate = resolve; }));

    render(<App />);
    await user.type(screen.getByLabelText(/describe the student/i), "A student who likes computer science and wants a balanced list.");
    await user.click(screen.getByRole("button", { name: /generate list/i }));

    expect(screen.getByText(/building the list/i)).toBeInTheDocument();

    resolveGenerate(sampleResult());

    // Results render once the request resolves.
    expect(await screen.findByRole("heading", { name: /college recommendations/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reach" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Target" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Likely" })).toBeInTheDocument();
    expect(screen.getByText("Reach University")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
  });

  it("downloads the current list when Download PDF is clicked", async () => {
    const user = userEvent.setup();
    api.generateCollegeList.mockResolvedValue(sampleResult());
    api.createCollegeListPdf.mockResolvedValue({ blob: new Blob(["pdf"]), filename: "list.pdf" });

    render(<App />);
    await user.type(screen.getByLabelText(/describe the student/i), "A student who likes computer science and wants a balanced list.");
    await user.click(screen.getByRole("button", { name: /generate list/i }));

    const download = await screen.findByRole("button", { name: /download pdf/i });
    await user.click(download);

    expect(api.createCollegeListPdf).toHaveBeenCalledOnce();
  });

  it("shows an error panel when generation fails", async () => {
    const user = userEvent.setup();
    api.generateCollegeList.mockRejectedValue(new Error("Scorecard is unavailable"));

    render(<App />);
    await user.type(screen.getByLabelText(/describe the student/i), "A student who likes computer science and wants a balanced list.");
    await user.click(screen.getByRole("button", { name: /generate list/i }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/scorecard is unavailable/i)).toBeInTheDocument();
  });
});
