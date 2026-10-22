/**
 * `npm run opportunities:check`: fails when a file in content/opportunities/ is invalid, not
 * in canonical form, or its filename doesn't match the slug inside it.
 */
import { checkOpportunityFiles, defaultOpportunitiesDir } from "../src/opportunities/files";

const problems = checkOpportunityFiles(defaultOpportunitiesDir());
for (const problem of problems) console.error(problem);
if (problems.length) process.exit(1);
console.log("content/opportunities/ is valid and in canonical form.");
