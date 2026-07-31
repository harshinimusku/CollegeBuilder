// Owns the app's server-facing state: the health check, the generated result,
// loading/error status, and the actions the UI triggers (generate, add/remove a college, download the PDF).
import { useCallback, useEffect, useState } from "react";
import { createCollegeListPdf, describeCollege, fetchHealth, generateCollegeList, generateCollegeListFromForm } from "../api/collegeApi";

const LOADING_MESSAGES = [
  "Structuring the student profile.",
  "Querying public College Scorecard records.",
  "Applying the requested constraints.",
  "Balancing Reach, Target, and Likely options.",
  "Writing evidence-based fit notes."
];

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function triggerDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function useCollegeList() {
  const [description, setDescription] = useState("");
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    let active = true;

    fetchHealth()
      .then(payload => {
        if (active) setHealth(payload);
      })
      .catch(() => {
        if (active) setHealthError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== "generating") {
      setLoadingMessageIndex(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setLoadingMessageIndex(current => Math.min(current + 1, LOADING_MESSAGES.length - 1));
    }, 2500);

    return () => window.clearInterval(timer);
  }, [phase]);

  const generate = useCallback(async () => {
    setError(null);
    setResult(null);
    setPhase("generating");

    try {
      const payload = await generateCollegeList(description);
      setResult(payload);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setPhase("idle");
    }
  }, [description]);

  const generateFromForm = useCallback(async form => {
    setError(null);
    setResult(null);
    setPhase("generating");

    try {
      const payload = await generateCollegeListFromForm(form);
      setResult(payload);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setPhase("idle");
    }
  }, []);

  const removeCollege = useCallback(id => {
    setResult(current => (current ? { ...current, colleges: current.colleges.filter(college => college.id !== id) } : current));
  }, []);

  // Ask the server (Gemini) to describe the added college, then insert it.
  const addCollege = useCallback(async college => {
    if (!result || result.colleges.some(existing => existing.id === college.id)) return;

    let described = college;
    try {
      const { whyFit, watchOut } = await describeCollege(college, result.profile);
      described = { ...college, whyFit, watchOut };
    } catch {
      // keep the template copy the search already provided
    }

    setResult(current => {
      if (!current || current.colleges.some(existing => existing.id === described.id)) return current;
      return { ...current, colleges: [...current.colleges, described] };
    });
  }, [result]);

  const downloadPdf = useCallback(async () => {
    if (!result) return;

    setError(null);
    setPhase("downloading");

    try {
      const pdf = await createCollegeListPdf(result);
      triggerDownload(pdf.blob, pdf.filename);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setPhase("idle");
    }
  }, [result]);

  return {
    description,
    setDescription,
    health,
    healthError,
    result,
    error,
    isGenerating: phase === "generating",
    isDownloading: phase === "downloading",
    loadingMessage: LOADING_MESSAGES[loadingMessageIndex],
    generate,
    generateFromForm,
    downloadPdf,
    addCollege,
    removeCollege
  };
}
