/**
 * The markdown-style rich-text string used in content files, and its typed form.
 *
 * Allowed syntax, nothing else:
 *   **bold**   *italic*   ==wavy underline==   [text](href)
 *   "- " at the start of a line for a bullet item
 *   a blank line between blocks, a single newline between bullet items
 *   backslash escapes for ASCII punctuation, e.g. \* \[ \= \\
 *
 * The typed form is a list of blocks, each holding "runs": text with a flat set of marks.
 * That is the shape of a ProseMirror document, so the editor maps onto it directly, and
 * `inlineTree` nests the marks again for rendering.
 *
 * Parsing is strict: the input must be exactly what `serializeRichText` produces for the
 * parsed value (the canonical form). That rules out ambiguous spellings such as
 * `*a **b** c*` and keeps diffs stable. `formatRichText` rewrites any input the grammar
 * accepts into the canonical form, for `npm run content:format`.
 */

export type Marks = {
  bold?: true;
  italic?: true;
  wavy?: true;
  link?: string;
};

export type Run = { text: string; marks: Marks };

export type Block =
  | { type: "paragraph"; runs: Run[] }
  | { type: "bulletList"; items: Run[][] };

export type RichText = Block[];

/** Marks nested for rendering: each mark wraps the runs it spans. */
export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "wavy"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] };

export class RichTextError extends Error {
  constructor(
    message: string,
    readonly line?: number,
    readonly column?: number,
  ) {
    super(line === undefined ? message : `${message} (line ${line}, column ${column})`);
    this.name = "RichTextError";
  }
}

// ---------------------------------------------------------------------------
// Text and links

/**
 * Characters never allowed in text: control characters (tabs and carriage returns too),
 * the Unicode line and paragraph separators, byte order marks, and the bidirectional
 * controls that can make text read differently from how it is stored.
 */
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

/** Whether text holds a character no content field may contain (see FORBIDDEN_TEXT). */
export function hasForbiddenText(text: string): boolean {
  return FORBIDDEN_TEXT.test(text);
}

/** An HTML character reference such as `&amp;` or `&#8217;`. Content is never HTML. */
const ENTITY = /^&(#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

/**
 * Printable ASCII that may appear in a link target. Spaces, quotes, angle brackets,
 * parentheses, square brackets, braces and backslashes are left out, as is anything
 * outside ASCII: those must be percent-encoded.
 */
const HREF_CHARS = /^[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+$/;

/** Why a link target is refused, or null when it is allowed. */
export function hrefProblem(href: string): string | null {
  if (href === "") return "Link has no target";
  if (!HREF_CHARS.test(href)) {
    return "Link contains a character that is not allowed (spaces, quotes, brackets, backslashes and non-ASCII characters must be percent-encoded)";
  }
  if (/%(?![0-9A-Fa-f]{2})/.test(href)) return "Link has a malformed percent-encoding";
  if (href.startsWith("//")) return "Protocol-relative links are not allowed";
  if (href.startsWith("/")) return null;
  if (href.startsWith("mailto:")) {
    return /^mailto:[^@]+@[^@]+\.[^@]+$/.test(href) ? null : "Not a valid email link";
  }
  if (href.startsWith("http://")) return "Use https: links, not http:";
  if (!href.startsWith("https://")) {
    return "Only https:, mailto: and site links (starting with /) are allowed";
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return "Not a valid web address";
  }
  if (url.username !== "" || url.password !== "") return "Links must not contain a user name or password";
  if (!url.hostname.includes(".")) return "Link needs a full domain name";
  return null;
}

/** `https:` URLs without credentials, `mailto:` addresses, and site paths. */
export function isAllowedHref(href: string): boolean {
  return hrefProblem(href) === null;
}

/** What links typed or pasted in are stored as: `http:` is upgraded to `https:`. */
export function upgradeHref(href: string): string {
  return href.startsWith("http://") ? `https://${href.slice("http://".length)}` : href;
}

// ---------------------------------------------------------------------------
// Serialising

type MarkKey = "link" | "wavy" | "bold" | "italic";
/** Tie-break order for marks opening together, outermost first. */
const MARK_ORDER: MarkKey[] = ["link", "wavy", "bold", "italic"];
type OpenMark = { key: MarkKey; href?: string };

function marksOf(m: Marks): OpenMark[] {
  return MARK_ORDER.filter((k) => m[k] !== undefined).map((key) =>
    key === "link" ? { key, href: m.link } : { key },
  );
}

const sameMark = (a: OpenMark, b: OpenMark) => a.key === b.key && a.href === b.href;

const OPEN_TOKEN: Record<MarkKey, string> = { link: "[", wavy: "==", bold: "**", italic: "*" };

function closeToken(m: OpenMark): string {
  return m.key === "link" ? `](${m.href})` : OPEN_TOKEN[m.key];
}

/** Characters that are always escaped in text. */
const ALWAYS_ESCAPE = new Set(["\\", "*", "[", "]", "=", "`"]);

function escapeRunText(text: string, nextOutputStartsWithBracket: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = text[i - 1];
    const next = text[i + 1];
    let escape = ALWAYS_ESCAPE.has(c);
    if ((c === "_" || c === "~") && (prev === c || next === c)) escape = true;
    if (c === "<" && next !== undefined && /[A-Za-z/!?]/.test(next)) escape = true;
    if (c === "!" && i === text.length - 1 && nextOutputStartsWithBracket) escape = true;
    if (c === "&" && ENTITY.test(text.slice(i))) escape = true;
    out += escape ? `\\${c}` : c;
  }
  return out;
}

/** Escapes a line start that markdown would read as a heading, quote or list. */
function escapeLineStart(line: string): string {
  if (/^(#|>|\+ )/.test(line)) return `\\${line}`;
  if (/^-( |-)/.test(line)) return `\\${line}`;
  const numbered = /^(\d+)([.)] )/.exec(line);
  if (numbered) return `${numbered[1]}\\${line.slice(numbered[1].length)}`;
  return line;
}

/** Moves whitespace at the edges of a marked range outside the mark. */
function expelWhitespace(runs: Run[]): Run[] {
  // A character-level view keeps this simple; rich-text fields are short.
  const chars: { c: string; marks: Marks }[] = [];
  for (const r of runs) for (const c of r.text) chars.push({ c, marks: { ...r.marks } });
  for (const key of MARK_ORDER) {
    let i = 0;
    while (i < chars.length) {
      if (chars[i].marks[key] === undefined) {
        i++;
        continue;
      }
      let end = i;
      while (end < chars.length && chars[end].marks[key] === chars[i].marks[key]) end++;
      for (let j = i; j < end && /\s/.test(chars[j].c); j++) delete chars[j].marks[key];
      for (let j = end - 1; j >= i && /\s/.test(chars[j].c); j--) delete chars[j].marks[key];
      i = end;
    }
  }
  return normalizeRuns(chars.map(({ c, marks }) => ({ text: c, marks })));
}

const sameMarks = (a: Marks, b: Marks) =>
  a.bold === b.bold && a.italic === b.italic && a.wavy === b.wavy && a.link === b.link;

/** Drops empty runs and merges neighbours with identical marks. */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (r.text === "") continue;
    const last = out[out.length - 1];
    if (last && sameMarks(last.marks, r.marks)) last.text += r.text;
    else out.push({ text: r.text, marks: { ...r.marks } });
  }
  return out;
}

type Step = { close: OpenMark[]; open: OpenMark[] };

/**
 * Works out which marks close and open before each run of one line. Marks already open stay
 * open while the run still has them (closing only what sits above a mark that ends); new
 * marks open longest-lasting first, so they nest with the fewest reopenings. One hard rule
 * keeps `*` runs unambiguous for the parser: bold never opens directly on top of italic.
 */
function planLine(input: Run[]): { runs: Run[]; steps: Step[] } {
  const runs = expelWhitespace(input);
  if (runs.length === 0) throw new RichTextError("Empty line");
  for (const r of runs) {
    if (r.text.includes("\n")) throw new RichTextError("Line break inside a line");
    if (FORBIDDEN_TEXT.test(r.text)) throw new RichTextError("Text contains a control or invisible formatting character");
    const href = r.marks.link;
    if (href !== undefined && !isAllowedHref(href)) throw new RichTextError(`Link not allowed: ${href}`);
  }

  const has = (r: Run, m: OpenMark) => marksOf(r.marks).some((x) => sameMark(x, m));
  const extent = (from: number, m: OpenMark) => {
    let n = from;
    while (n < runs.length && has(runs[n], m)) n++;
    return n;
  };
  const steps: Step[] = [];
  let stack: OpenMark[] = [];
  runs.forEach((r, i) => {
    let keep = 0;
    while (keep < stack.length && has(r, stack[keep])) keep++;
    const opening = () =>
      marksOf(r.marks)
        .filter((m) => !stack.slice(0, keep).some((k) => sameMark(k, m)))
        .sort((a, b) => extent(i, b) - extent(i, a) || MARK_ORDER.indexOf(a.key) - MARK_ORDER.indexOf(b.key));
    let open = opening();
    if (open.some((m) => m.key === "bold") && stack[keep - 1]?.key === "italic") {
      keep--;
      open = opening();
    }
    const b = open.findIndex((m) => m.key === "bold");
    const it = open.findIndex((m) => m.key === "italic");
    if (b !== -1 && it !== -1 && it < b) [open[it], open[b]] = [open[b], open[it]];
    steps.push({ close: stack.slice(keep).reverse(), open });
    stack = [...stack.slice(0, keep), ...open];
  });
  steps.push({ close: stack.reverse(), open: [] });
  return { runs, steps };
}

function serializeLine(input: Run[]): string {
  const { runs, steps } = planLine(input);
  let out = "";
  runs.forEach((r, i) => {
    const { close, open } = steps[i];
    out += close.map(closeToken).join("") + open.map((m) => OPEN_TOKEN[m.key]).join("");
    const next = steps[i + 1];
    const nextStartsWithBracket = next.close.length === 0 && next.open[0]?.key === "link";
    out += escapeRunText(r.text, nextStartsWithBracket);
  });
  out += steps[runs.length].close.map(closeToken).join("");

  if (/^\s|\s$/.test(out)) throw new RichTextError("Leading or trailing whitespace in a line");
  return escapeLineStart(out);
}

export function serializeRichText(doc: RichText): string {
  return doc
    .map((block) => {
      if (block.type === "paragraph") return serializeLine(block.runs);
      if (block.items.length === 0) throw new RichTextError("Empty list");
      return block.items.map((item) => `- ${serializeLine(item)}`).join("\n");
    })
    .join("\n\n");
}

/** Nests a line's runs into mark elements, the same nesting the serialiser writes. */
export function inlineTree(input: Run[]): InlineNode[] {
  const { runs, steps } = planLine(input);
  const root: InlineNode[] = [];
  const stack: InlineNode[][] = [root];
  runs.forEach((r, i) => {
    for (let n = 0; n < steps[i].close.length; n++) stack.pop();
    for (const m of steps[i].open) {
      const node: InlineNode =
        m.key === "link" ? { type: "link", href: m.href!, children: [] } : { type: m.key, children: [] };
      stack[stack.length - 1].push(node);
      stack.push(node.children);
    }
    stack[stack.length - 1].push({ type: "text", text: r.text });
  });
  return root;
}

// ---------------------------------------------------------------------------
// Parsing

const ESCAPABLE = /[!-/:-@[-`{-~]/; // ASCII punctuation

type StackEntry = { key: MarkKey; runsAtOpen: number; link?: { href?: string } };
/** `upgradeHttp` rewrites `http:` links as `https:`. */
type ParseOptions = { upgradeHttp?: boolean };

function parseLine(line: string, lineNo: number, colOffset: number, options: ParseOptions): Run[] {
  const fail = (msg: string, i: number): never => {
    throw new RichTextError(msg, lineNo, colOffset + i + 1);
  };
  if (line === "") fail("Empty line", 0);
  const forbidden = FORBIDDEN_TEXT.exec(line);
  if (forbidden) fail("Control or invisible formatting character", forbidden.index);
  if (/^\s|\s$/.test(line)) fail("Leading or trailing whitespace", 0);
  if (/^(#|>|[*+] |-( |-)|\d+[.)] )/.test(line)) fail("Unsupported line start (heading, quote, list or rule)", 0);

  const runs: (Run & { linkRef?: { href?: string } })[] = [];
  const stack: StackEntry[] = [];
  let text = "";

  const flush = () => {
    if (text === "") return;
    const marks: Marks = {};
    let linkRef: { href?: string } | undefined;
    for (const e of stack) {
      if (e.key === "link") linkRef = e.link;
      else marks[e.key] = true;
    }
    runs.push({ text, marks, linkRef });
    text = "";
  };
  const top = () => stack[stack.length - 1];
  const open = (key: MarkKey, i: number) => {
    if (stack.some((e) => e.key === key)) fail(`Nested or overlapping ${key}`, i);
    flush();
    stack.push({ key, runsAtOpen: runs.length, link: key === "link" ? {} : undefined });
  };
  const close = (key: MarkKey, i: number) => {
    if (top()?.key !== key) fail(`Overlapping marks: cannot close ${key} here`, i);
    flush();
    const e = stack.pop()!;
    if (runs.length === e.runsAtOpen) fail(`Empty ${key}`, i);
    return e;
  };

  let i = 0;
  while (i < line.length) {
    const c = line[i];
    const next = line[i + 1];
    if (c === "\\") {
      if (next === undefined || !ESCAPABLE.test(next)) fail("Backslash must escape punctuation", i);
      text += next;
      i += 2;
    } else if (c === "*") {
      if (top()?.key === "italic") {
        // Exactly `**` inside italic could close the italic or open bold. The canonical form
        // never writes it (it nests bold outside italic), so refuse it rather than guess.
        if (next === "*" && line[i + 2] !== "*") {
          fail("Ambiguous ** inside italic: write bold outside italic, e.g. *a* ***b*** *c*", i);
        }
        close("italic", i);
        i += 1;
      } else if (top()?.key === "bold" && next === "*") {
        close("bold", i);
        i += 2;
      } else if (next === "*") {
        open("bold", i);
        i += 2;
      } else {
        open("italic", i);
        i += 1;
      }
    } else if (c === "=") {
      if (next !== "=") fail("A single = must be escaped as \\=", i);
      if (top()?.key === "wavy") close("wavy", i);
      else open("wavy", i);
      i += 2;
    } else if (c === "[") {
      open("link", i);
      i += 1;
    } else if (c === "]") {
      if (next !== "(") fail("Expected ( after ]", i);
      const end = line.indexOf(")", i + 2);
      if (end === -1) fail("Unclosed link target", i);
      const written = line.slice(i + 2, end);
      const href = options.upgradeHttp ? upgradeHref(written) : written;
      const problem = hrefProblem(href);
      if (problem) fail(`${problem}: ${written}`, i + 2);
      const e = close("link", i);
      e.link!.href = href;
      i = end + 1;
    } else if (c === "`") {
      fail("Code spans are not supported", i);
    } else if (c === "<" && next !== undefined && /[A-Za-z/!?]/.test(next)) {
      fail("HTML is not supported", i);
    } else if (c === "&" && ENTITY.test(line.slice(i))) {
      fail("HTML character references are not supported; type the character itself", i);
    } else if ((c === "_" || c === "~") && next === c) {
      fail(`${c}${c} is not supported`, i);
    } else if (c === "!" && next === "[") {
      fail("Images are not supported", i);
    } else {
      text += c;
      i += 1;
    }
  }
  if (stack.length > 0) fail(`Unclosed ${top().key}`, line.length);
  flush();

  return normalizeRuns(
    runs.map(({ text, marks, linkRef }) => ({
      text,
      marks: linkRef ? { ...marks, link: linkRef.href! } : marks,
    })),
  );
}

/**
 * Parses the grammar without the canonical-form check. Used by `formatRichText` (with
 * `upgradeHttp`) and in tests; content loading uses `parseRichText`.
 */
export function parseRichTextLoose(input: string, options: ParseOptions = {}): RichText {
  if (input === "") return [];
  const blocks: RichText = [];
  let lineNo = 1;
  for (const blockText of input.split("\n\n")) {
    if (blockText === "") throw new RichTextError("Extra blank line", lineNo, 1);
    const lines = blockText.split("\n");
    const bullets = lines.filter((l) => l.startsWith("- "));
    if (bullets.length === lines.length) {
      blocks.push({
        type: "bulletList",
        items: lines.map((l, k) => parseLine(l.slice(2), lineNo + k, 2, options)),
      });
    } else if (bullets.length > 0) {
      throw new RichTextError("Every line of a list must start with '- '", lineNo, 1);
    } else if (lines.length > 1) {
      throw new RichTextError("Single line breaks are not allowed inside a paragraph", lineNo + 1, 1);
    } else {
      blocks.push({ type: "paragraph", runs: parseLine(lines[0], lineNo, 0, options) });
    }
    lineNo += lines.length + 1;
  }
  return blocks;
}

export function parseRichText(input: string): RichText {
  const doc = parseRichTextLoose(input);
  const canonical = serializeRichText(doc);
  if (canonical !== input) {
    throw new RichTextError(`Not in canonical form; expected: ${JSON.stringify(canonical)}`);
  }
  return doc;
}

/**
 * Rewrites rich text into its canonical form: outer whitespace trimmed, `http:` links
 * upgraded, marks and escapes written the one canonical way. Throws for anything the
 * grammar does not accept, including `*` runs that could be read in more than one way.
 */
export function formatRichText(input: string): string {
  return serializeRichText(parseRichTextLoose(input.trim(), { upgradeHttp: true }));
}
