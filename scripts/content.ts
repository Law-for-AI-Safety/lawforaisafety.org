/**
 * `npm run content:check`: fails when a file in content/ is invalid, not in canonical form,
 * or links to a page that does not exist.
 * `npm run content:format`: rewrites the files in content/ into canonical form.
 */
import { checkContent, defaultDirs, formatContentFiles } from "../src/cms/content-files";

const mode = process.argv[2];
const dirs = defaultDirs();

try {
  if (mode === "format") {
    const changed = formatContentFiles(dirs.contentDir);
    console.log(changed.length ? `Formatted: ${changed.map((s) => `content/${s}.json`).join(", ")}` : "Content already in canonical form.");
  } else if (mode === "check") {
    const problems = checkContent(dirs);
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exit(1);
    console.log("Content is valid and in canonical form.");
  } else {
    console.error("Usage: tsx scripts/content.ts check|format");
    process.exit(2);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
