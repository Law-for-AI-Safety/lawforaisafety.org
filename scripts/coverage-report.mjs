import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prints the test coverage as Markdown: the overall figures, then for every file with a
 * statement that never ran, the lines it is on. CI appends this to the job summary so a
 * coverage failure can be read from the run page; `npm run coverage:report` does the same
 * locally. Files no test loads at all are listed too, since `coverage.include` covers src/.
 */


const dir = path.resolve("coverage");

/** Collapses sorted line numbers into "3, 7-9, 12". */
export function formatRanges(lines) {
  const ranges = [];
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i];
    while (i + 1 < lines.length && lines[i + 1] === lines[i] + 1) i++;
    ranges.push(start === lines[i] ? String(start) : `${start}-${lines[i]}`);
  }
  return ranges.join(", ");
}

/** Lines holding a statement that never executed. */
export function uncoveredLines(file) {
  const lines = new Set();
  for (const [id, count] of Object.entries(file.s)) {
    if (count === 0) lines.add(file.statementMap[id].start.line);
  }
  return [...lines].sort((a, b) => a - b);
}

export function report(summary, files, root = process.cwd()) {
  const out = ["## Test coverage", "", "| Metric | Coverage | Covered |", "|---|---|---|"];
  for (const k of ["lines", "statements", "branches", "functions"]) {
    out.push(`| ${k} | ${summary[k].pct}% | ${summary[k].covered}/${summary[k].total} |`);
  }
  const missed = files
    .map((f) => ({ file: path.relative(root, f.path), lines: uncoveredLines(f) }))
    .filter((f) => f.lines.length > 0)
    .sort((a, b) => a.file.localeCompare(b.file));
  if (missed.length > 0) {
    out.push("", "### Uncovered lines", "", "| File | Lines |", "|---|---|");
    for (const { file, lines } of missed) out.push(`| \`${file}\` | ${formatRanges(lines)} |`);
  }
  return out.join("\n") + "\n";
}

/** The report for the coverage directory's current contents. */
export function currentReport() {
  const summaryPath = path.join(dir, "coverage-summary.json");
  if (!fs.existsSync(summaryPath)) {
    return "## Test coverage\n\nNo coverage report was produced.\n";
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8")).total;
  const files = Object.values(
    JSON.parse(fs.readFileSync(path.join(dir, "coverage-final.json"), "utf8")),
  );
  return report(summary, files);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(currentReport());
}
