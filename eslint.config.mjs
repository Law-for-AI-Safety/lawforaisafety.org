import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The content route (src/app/[slug]) sits at the root, and this rule reads its dynamic
    // segment as matching any path, slashes included, so it takes the LinkedIn sign-in
    // route handler for a page. A full page load is what that link needs.
    files: ["src/app/admin/login/page.tsx"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test coverage output.
    "coverage/**",
  ]),
]);

export default eslintConfig;
