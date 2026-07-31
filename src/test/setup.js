import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom doesn't implement object URLs; the PDF download path uses them, so stub
// them out to no-ops for tests.
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = vi.fn(() => "blob:mock");
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = vi.fn();

// jsdom has no layout engine, so scrollIntoView is missing. The results panel
// scrolls itself into view on render; stub it so that doesn't throw.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();

// The download helper clicks a temporary <a>; jsdom would try to navigate and
// log a warning. Make programmatic anchor clicks no-ops.
HTMLAnchorElement.prototype.click = vi.fn();
