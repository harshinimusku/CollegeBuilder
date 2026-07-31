// Page geometry and palette
const PAGE_W = 612;
const PAGE_H = 792;
const ML = 48;
const MR = 48;
const CONTENT_W = PAGE_W - ML - MR; // 516
const RIGHT_EDGE = PAGE_W - MR; // 564

const COLORS = {
  navy: [0.086, 0.129, 0.227],
  bodyDark: [0.13, 0.16, 0.2],
  gray: [0.42, 0.45, 0.5],
  faintOnNavy: [0.76, 0.81, 0.89],
  white: [1, 1, 1],
  cardBorder: [0.88, 0.89, 0.91],
  hairline: [0.85, 0.85, 0.87],
  snapshotBg: [0.93, 0.95, 0.99],
  snapshotBorder: [0.8, 0.85, 0.93],
  snapshotAccent: [0.2, 0.4, 0.66],
  howToBg: [0.99, 0.97, 0.9],
  howToBorder: [0.9, 0.85, 0.7],
  howToAccent: [0.66, 0.52, 0.16],
  reach: [0.7, 0.14, 0.18],
  target: [0.13, 0.35, 0.6],
  likely: [0.15, 0.45, 0.28]
};

// Entry point: compose the pages, add footers, then serialize everything into PDF bytes. This is a small hand-written PDF writer — no external library.
export function buildPdf(result) {
  const pages = composeDoc(result);
  addFooters(pages);

  const objectBodies = [];
  const setObject = (id, body) => {
    objectBodies[id] = body;
  };

  setObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  setObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const pageRefs = [];
  pages.forEach((page, i) => {
    const contentId = 5 + i * 2;
    const pageId = contentId + 1;
    pageRefs.push(`${pageId} 0 R`);
    const stream = pageStream(page.ops);
    setObject(contentId, `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    setObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
  });

  setObject(2, `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`);
  setObject(1, "<< /Type /Catalog /Pages 2 0 R >>");

  let output = "%PDF-1.4\n%CLB1\n";
  const offsets = [0];
  for (let id = 1; id < objectBodies.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, "latin1");
    output += `${id} 0 obj\n${objectBodies[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objectBodies.length}\n`;
  output += "0000000000 65535 f \n";
  for (let id = 1; id < objectBodies.length; id += 1) output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objectBodies.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

// Lay out the whole document: header band, student snapshot, the college cards (sorted Reach/Target/Likely), a how-to panel, and the small print.
function composeDoc(result) {
  const doc = createDoc();

  // Header band (page 1)
  const bandH = 92;
  doc.rect(0, PAGE_H - bandH, PAGE_W, bandH, { fill: COLORS.navy });
  doc.text("College List Builder", ML, PAGE_H - 46, { size: 26, bold: true, color: COLORS.white });
  const subtitle = result.profile.studentName ? `Prepared for ${result.profile.studentName}` : "Prepared from a counselor-provided profile";
  doc.text(subtitle, ML, PAGE_H - 70, { size: 12, color: COLORS.faintOnNavy });
  const dateLabel = new Date(result.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  doc.textRight(dateLabel, RIGHT_EDGE, PAGE_H - 70, { size: 11, color: COLORS.faintOnNavy });
  doc.y = PAGE_H - bandH - 24;

  // Student snapshot
  const profileBits = [
    result.profile.sat ? `${result.profile.sat} SAT` : null,
    result.profile.gpa ? `${result.profile.gpa} GPA` : null,
    result.profile.majors?.length ? `interests: ${result.profile.majors.join(", ")}` : null,
    result.profile.homeState ? `home: ${result.profile.homeState}` : null,
    result.profile.financialAidNeed ? `aid need: ${result.profile.financialAidNeed}` : null
  ].filter(Boolean);
  doc.panel(
    [
      { text: "STUDENT SNAPSHOT", size: 10, bold: true, color: COLORS.snapshotAccent, gapAfter: 8 },
      { text: profileBits.join("  |  ") || "Limited structured academic information was available.", size: 12, color: COLORS.bodyDark, gapAfter: 6 },
      { text: result.overview, size: 9.5, color: COLORS.gray, gapAfter: 0 }
    ],
    { fill: COLORS.snapshotBg, border: COLORS.snapshotBorder, accent: COLORS.snapshotAccent }
  );

  // sort into Reach / Target / Likely order (added schools land in the right group)
  const categoryOrder = { Reach: 0, Target: 1, Likely: 2 };
  const orderedColleges = [...(result.colleges ?? [])].sort(
    (a, b) => (categoryOrder[a.category] ?? 3) - (categoryOrder[b.category] ?? 3) || (b.matchScore ?? 0) - (a.matchScore ?? 0)
  );
  for (const college of orderedColleges) {
    const accent = categoryColor(college.category);
    const padX = 20;
    const innerW = CONTENT_W - padX * 2;
    const specs = [
      { text: college.name, size: 15, bold: true, color: COLORS.navy, wrapW: innerW - 95, gapAfter: 5 },
      { text: collegeMeta(college), size: 9.5, color: COLORS.gray, gapAfter: 4 },
      { text: collegeMetrics(college), size: 9, color: COLORS.gray, gapAfter: 7 },
      { text: `Why it fits: ${college.whyFit}`, size: 9.5, color: COLORS.bodyDark, gapAfter: 4 },
      { text: `Verify: ${college.watchOut}`, size: 9, color: COLORS.gray, gapAfter: 0 }
    ];
    const { height } = layoutSpecs(specs, innerW, 14);
    const boxH = height + 14;
    if (doc.y - boxH < 64) doc.newPage();
    const top = doc.y;
    const boxY = top - boxH;
    doc.rect(ML, boxY, CONTENT_W, boxH, { fill: COLORS.white, stroke: COLORS.cardBorder, lineWidth: 0.8 });
    doc.rect(ML, boxY, 5, boxH, { fill: accent });
    // Category badge, top-right
    doc.textRight(college.category.toUpperCase(), ML + CONTENT_W - 16, top - 26, { size: 9.5, bold: true, color: accent });
    for (const line of layoutSpecs(specs, innerW, 14).lines) {
      doc.text(line.text, ML + padX + line.indent, top - line.dyTop, { size: line.size, bold: line.bold, color: line.color });
    }
    doc.y = boxY - 14;
  }

  // How to use this list
  const howToSpecs = [{ text: "HOW TO USE THIS LIST", size: 10, bold: true, color: COLORS.howToAccent, gapAfter: 8 }];
  for (const note of result.strategyNotes ?? []) howToSpecs.push({ text: `-  ${note}`, size: 9.5, color: COLORS.bodyDark, indent: 6, gapAfter: 4 });
  doc.panel(howToSpecs, { fill: COLORS.howToBg, border: COLORS.howToBorder, accent: COLORS.howToAccent, gapAfter: 14 });

  // Small print
  const dataSource = "U.S. Department of Education College Scorecard";
  doc.panel(
    [
      { text: result.disclaimer, size: 7.5, color: COLORS.gray, gapAfter: 4 },
      { text: `Data source: ${dataSource}.`, size: 7.5, color: COLORS.gray, gapAfter: 0 }
    ],
    { fill: COLORS.white, padTop: 4, padBottom: 4, padX: 0, gapAfter: 0 }
  );

  return doc.pages;
}

// Footer on every page (added after page count is known)
function addFooters(pages) {
  pages.forEach((page, index) => {
    page.ops.push({ type: "rect", x: ML, y: 46, w: CONTENT_W, h: 0.8, fill: COLORS.hairline });
    page.ops.push({
      type: "text",
      text: "Counselor starting point - verify programs, costs, policies, and admission data before use.",
      x: ML,
      y: 32,
      size: 8,
      bold: false,
      color: COLORS.gray
    });
    const label = `${index + 1}/${pages.length}`;
    page.ops.push({ type: "text", text: label, x: RIGHT_EDGE - textWidth(label, 8, false), y: 32, size: 8, bold: false, color: COLORS.gray });
  });
}

// Document model: pages hold ordered drawing ops (rects, then text on top).
// The helpers on `state` are the little drawing API composeDoc uses.
function createDoc() {
  const pages = [{ ops: [] }];
  const state = { pages, page: pages[0], y: PAGE_H };

  state.rect = (x, y, w, h, opts = {}) => state.page.ops.push({ type: "rect", x, y, w, h, ...opts });
  state.text = (text, x, y, opts = {}) =>
    state.page.ops.push({ type: "text", text, x, y, size: opts.size ?? 10, bold: !!opts.bold, color: opts.color ?? COLORS.bodyDark });
  state.textRight = (text, rightX, y, opts = {}) =>
    state.text(text, rightX - textWidth(text, opts.size ?? 10, opts.bold), y, opts);

  state.newPage = () => {
    state.page = { ops: [] };
    pages.push(state.page);
    state.y = PAGE_H - 56;
  };

  // a boxed panel of text lines, optional left accent bar
  state.panel = (specs, { fill, border, accent, padTop = 14, padBottom = 14, padX = 18, gapAfter = 16 }) => {
    const innerW = CONTENT_W - padX * 2;
    const { lines, height } = layoutSpecs(specs, innerW, padTop);
    const boxH = height + padBottom;
    if (state.y - boxH < 60) state.newPage();
    const top = state.y;
    const boxY = top - boxH;
    state.rect(ML, boxY, CONTENT_W, boxH, { fill: fill ?? COLORS.white, stroke: border, lineWidth: 0.8 });
    if (accent) state.rect(ML, boxY, 4, boxH, { fill: accent });
    for (const line of lines) {
      state.text(line.text, ML + padX + line.indent, top - line.dyTop, { size: line.size, bold: line.bold, color: line.color });
    }
    state.y = boxY - gapAfter;
    return { top, boxY, boxH };
  };

  return state;
}

// Lay a stack of text specs into positioned lines, measured from a box top.
// Returns { lines, height } where each line has a `dyTop` baseline offset.
function layoutSpecs(specs, innerW, padTop) {
  let cur = padTop;
  const lines = [];
  for (const spec of specs) {
    const wrapW = spec.wrapW ?? innerW - (spec.indent ?? 0);
    for (const text of wrapForWidth(spec.text, spec.size, wrapW, spec.bold)) {
      cur += spec.size;
      lines.push({ text, size: spec.size, bold: !!spec.bold, color: spec.color, indent: spec.indent ?? 0, dyTop: cur });
      cur += spec.size * 0.34;
    }
    cur += spec.gapAfter ?? 5;
  }
  return { lines, height: cur };
}

function categoryColor(category) {
  if (category === "Reach") return COLORS.reach;
  if (category === "Likely") return COLORS.likely;
  return COLORS.target;
}

function sizeBand(size) {
  if (!Number.isFinite(size)) return null;
  if (size < 5000) return "small";
  if (size <= 15000) return "medium";
  return "large";
}

function ownershipLabel(code) {
  if (code === 1) return "public";
  if (code === 2) return "private";
  if (code === 3) return "for-profit";
  return null;
}

function collegeMeta(college) {
  return [`${college.city}, ${college.state}`, college.setting !== "any" ? college.setting : null, sizeBand(college.size), ownershipLabel(college.ownership)]
    .filter(Boolean)
    .join("  |  ");
}

function collegeMetrics(college) {
  return [
    `Match ${college.matchScore}/100`,
    Number.isFinite(college.admissionRate) ? `Admit ${Math.round(college.admissionRate * 100)}%` : "Admit n/a",
    Number.isFinite(college.sat) ? `Avg SAT ${Math.round(college.sat)}` : "Avg SAT n/a",
    `Net price ${formatMoney(college.netPrice)}`
  ].join("  |  ");
}

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");
}

function escapePdfText(value) {
  return cleanText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function charWidth(size, bold) {
  return size * (bold ? 0.58 : 0.5);
}

function textWidth(text, size, bold) {
  return cleanText(text).length * charWidth(size, bold);
}

function wrapForWidth(text, size, widthPts, bold = false) {
  const maxChars = Math.max(6, Math.floor(widthPts / charWidth(size, bold)));
  const words = cleanText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}


function pageStream(ops) {
  const commands = [];
  for (const op of ops) {
    if (op.type === "rect") {
      commands.push("q");
      if (op.fill) commands.push(`${color(op.fill)} rg`);
      if (op.stroke) commands.push(`${color(op.stroke)} RG`, `${num(op.lineWidth ?? 1)} w`);
      commands.push(`${num(op.x)} ${num(op.y)} ${num(op.w)} ${num(op.h)} re`);
      if (op.fill && op.stroke) commands.push("B");
      else if (op.fill) commands.push("f");
      else commands.push("S");
      commands.push("Q");
    } else {
      commands.push("BT");
      commands.push(`/${op.bold ? "F2" : "F1"} ${num(op.size)} Tf`);
      commands.push(`${color(op.color)} rg`);
      commands.push(`${num(op.x)} ${num(op.y)} Td`);
      commands.push(`(${escapePdfText(op.text)}) Tj`);
      commands.push("ET");
    }
  }
  return commands.join("\n");
}

function formatMoney(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value) : "Not reported";
}

function num(value) {
  return (Math.round(value * 100) / 100).toString();
}

function color(rgb) {
  return `${num(rgb[0])} ${num(rgb[1])} ${num(rgb[2])}`;
}
