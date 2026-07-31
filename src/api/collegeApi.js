// One place for every backend call. requestJson unwraps the JSON and turns a non-2xx response into a thrown Error carrying the server's message, so the hook can just try/catch.
async function requestJson(input, init) {
  const response = await fetch(input, init);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }

  return payload;
}

export function fetchHealth() {
  return requestJson("/api/health");
}

export function generateCollegeList(description) {
  return requestJson("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description })
  });
}

export function generateCollegeListFromForm(form) {
  return requestJson("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ form })
  });
}

export function searchColleges(query, profile) {
  return requestJson("/api/colleges/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, profile })
  }).then(payload => payload.colleges);
}

// Ask Gemini (server-side) to write a why-fit / watch-out for one added college.
export function describeCollege(college, profile) {
  return requestJson("/api/colleges/describe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ college, profile })
  });
}

export async function createCollegeListPdf(result) {
  const response = await fetch("/api/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result)
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "PDF generation failed.");
  }

  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "college-list.pdf";
  return { blob: await response.blob(), filename };
}
