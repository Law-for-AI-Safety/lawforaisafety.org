import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A module marked `"use client"` reaches a server module only as client references: its
 * components can be rendered and passed as props, but calling one of its plain functions or
 * reading one of its constants from the server throws at request time ("Attempted to call
 * x() from the server but x is on the client"). Vitest ignores the directive, so a test that
 * renders the server page passes either way; this check reads the imports instead.
 *
 * An import counts as a component when its name is PascalCase. Any other value imported by a
 * module without the directive from one with it is reported; type-only imports are erased and
 * so are fine.
 */

const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");
const EXTENSIONS = [".ts", ".tsx"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return EXTENSIONS.some((ext) => path.endsWith(ext)) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

function resolveImport(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : undefined;
  if (!base) return undefined;
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => join(base, "index" + ext))];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile());
}

function isClientModule(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use client"
  );
}

const parse = (path: string) =>
  ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const isComponentName = (name: string) => /^[A-Z][a-z0-9]/.test(name);

/** Each `file: name from specifier` where a module without the directive takes a non-component value from one with it. */
function clientBoundaryViolations(files: string[]): string[] {
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
      const target = resolveImport(path, specifier.text);
      if (!target || !isClient(target)) return [];

      let names: { name: string; typeOnly: boolean }[];
      if (isImport) {
        const clause = statement.importClause;
        if (!clause || clause.isTypeOnly) return [];
        const bindings = clause.namedBindings;
        names = bindings && ts.isNamedImports(bindings)
          ? bindings.elements.map((el) => ({ name: (el.propertyName ?? el.name).text, typeOnly: el.isTypeOnly }))
          : [];
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
        .map(({ name }) => `${relative(ROOT, path)}: ${name} from ${specifier.text}`);
    });
  });
}

describe("the client boundary", () => {
  it("never has a server module call a plain function from a client module", () => {
    expect(clientBoundaryViolations(sourceFiles(SRC))).toEqual([]);
  });
});
