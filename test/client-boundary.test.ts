import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

/**
 * A module marked `"use client"` reaches a server module only as client references: its
 * components can be rendered and passed as props, but calling one of its plain functions or
 * reading one of its constants from the server throws at request time ("Attempted to call
 * x() from the server but x is on the client"). Vitest ignores the directive, so a test that
 * renders the server page passes either way; this check reads the imports instead.
 *
 * An import counts as a component when its local name starts with a capital and is not all
 * capitals (`OpportunityFields`, `PDFViewer`, not `GLOBAL`), since that is the name JSX renders
 * it under. Any other value imported by a module without the directive from one with it is
 * reported, default imports included; type-only imports are erased and so are fine.
 */

const ROOT = resolve(__dirname, "..");
const EXTENSIONS = [".ts", ".tsx"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return EXTENSIONS.some((ext) => path.endsWith(ext)) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

function resolveImport(src: string, from: string, specifier: string): string | undefined {
  const path = specifier.startsWith("@/")
    ? join(src, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (!path) return undefined;
  // `./Field.js` names `./Field.tsx` under bundler resolution.
  const base = path.replace(/\.[jt]sx?$/, "");
  const candidates = [path, base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => join(base, "index" + ext))];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile());
}

/** Whether `"use client"` is among the directives at the top of the file. */
function isClientModule(source: ts.SourceFile): boolean {
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === "use client") return true;
  }
  return false;
}

const parse = (path: string) =>
  ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const isComponentName = (name: string) => /^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name);

/** Each `file: name from specifier` where a module without the directive takes a non-component value from one with it. */
function clientBoundaryViolations(src: string): string[] {
  const files = sourceFiles(src);
  const parsed = new Map(files.map((path) => [path, parse(path)]));
  const isClient = (path: string) => isClientModule(parsed.get(path) ?? parse(path));

  return files.flatMap((path) => {
    const source = parsed.get(path)!;
    if (isClientModule(source)) return [];
    return source.statements.flatMap((statement) => {
      const isImport = ts.isImportDeclaration(statement);
      if (!isImport && !ts.isExportDeclaration(statement)) return [];
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) return [];
      const target = resolveImport(src, path, specifier.text);
      if (!target || !isClient(target)) return [];

      let names: { name: string; typeOnly: boolean }[];
      if (isImport) {
        const clause = statement.importClause;
        if (!clause || clause.isTypeOnly) return [];
        const bindings = clause.namedBindings;
        names = bindings && ts.isNamedImports(bindings)
          ? bindings.elements.map((el) => ({ name: el.name.text, typeOnly: el.isTypeOnly }))
          : [];
        if (clause.name) names.push({ name: clause.name.text, typeOnly: false });
        if (bindings && ts.isNamespaceImport(bindings)) names.push({ name: `* as ${bindings.name.text}`, typeOnly: false });
      } else {
        if (statement.isTypeOnly) return [];
        const clause = statement.exportClause;
        names = clause && ts.isNamedExports(clause)
          ? clause.elements.map((el) => ({ name: (el.propertyName ?? el.name).text, typeOnly: el.isTypeOnly }))
          : [{ name: "*", typeOnly: false }];
      }
      return names
        .filter(({ name, typeOnly }) => !typeOnly && !isComponentName(name))
        .map(({ name }) => `${relative(src, path)}: ${name} from ${specifier.text}`);
    });
  });
}

describe("the client boundary", () => {
  it("never has a server module take a function or constant from a client module", () => {
    expect(clientBoundaryViolations(join(ROOT, "src"))).toEqual([]);
  });
});

describe("the client boundary check", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function violations(files: Record<string, string>): string[] {
    dir = mkdtempSync(join(tmpdir(), "client-boundary-"));
    for (const [name, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), contents);
    }
    return clientBoundaryViolations(dir);
  }

  const CLIENT = `"use client";
export default function helper() {}
export function format() {}
export const LIMIT = 3;
export function Field() {}
export function PDFViewer() {}
export type State = {};
`;

  it("reports named, default and namespace imports of plain values, wherever the path points", () => {
    expect(
      violations({
        "Field.tsx": CLIENT,
        "page.tsx": `import helper, { format, LIMIT } from "./Field";
import * as all from "@/Field.js";
export { format as again } from "./Field.tsx";
`,
      }),
    ).toEqual([
      "page.tsx: format from ./Field",
      "page.tsx: LIMIT from ./Field",
      "page.tsx: helper from ./Field",
      "page.tsx: * as all from @/Field.js",
      "page.tsx: format from ./Field.tsx",
    ]);
  });

  it("allows components, types, and imports between client modules", () => {
    expect(
      violations({
        "Field.tsx": CLIENT,
        "page.tsx": `import Helper, { Field, PDFViewer, type State } from "./Field";
import type { State as S } from "./Field";
`,
        "Other.tsx": `"use strict";
"use client";
import { format } from "./Field";
`,
      }),
    ).toEqual([]);
  });

  it("finds the directive after other directives", () => {
    expect(
      violations({
        "Field.tsx": `"use strict";\n${CLIENT}`,
        "page.tsx": `import { format } from "./Field";\n`,
      }),
    ).toEqual(["page.tsx: format from ./Field"]);
  });
});
