import { createPrivateKey, type KeyObject } from "node:crypto";

/**
 * Reads the GitHub App's private key however a host is likely to have stored it: as the
 * `.pem` file with real line breaks, on one line with `\n` escapes, with Windows line breaks,
 * with its line breaks turned into spaces or lost, wrapped in quotes, or as the whole PEM
 * base64-encoded. It is rebuilt into a proper PEM from its BEGIN line's type and its base64
 * body before it is parsed.
 *
 * A key that cannot be read is described in terms that never quote it: which part is missing
 * or wrong, never any of its characters. The BEGIN line's type is named, as it is one of a few
 * fixed words, not key material.
 */

export const KEY_ENV = "GITHUB_APP_PRIVATE_KEY";

export type KeyFormat = "pkcs1" | "pkcs8";

export type KeyReading = { ok: true; key: KeyObject; format: KeyFormat; bits: number } | { ok: false; problem: string };

/** The PEM types a GitHub App key can come as: PKCS#1, as GitHub issues it, or PKCS#8. */
const FORMATS: Record<string, KeyFormat> = { "RSA PRIVATE KEY": "pkcs1", "PRIVATE KEY": "pkcs8" };

/** A GitHub App key is well over this; an OAuth client secret (40 characters) or an ID is well under. */
const SHORTEST_KEY = 200;

const MIN_BITS = 2048;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const problem = (text: string): KeyReading => ({ ok: false, problem: `${KEY_ENV} ${text}` });

/** Surrounding whitespace and quotes off, `\n` escapes and Windows line breaks made plain line breaks. */
function unwrap(raw: string): string {
  let text = raw.trim();
  for (let quoted = /^(["'`])([\s\S]*)\1$/.exec(text); quoted; quoted = /^(["'`])([\s\S]*)\1$/.exec(text)) text = quoted[2].trim();
  return text.replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\r\n?/g, "\n");
}

/** The text of a whole PEM stored base64-encoded, or null when `text` is not one. */
function decodedPem(text: string): string | null {
  const compact = text.replace(/\s+/g, "");
  if (!BASE64.test(compact)) return null;
  const decoded = Buffer.from(compact, "base64").toString("utf8");
  return decoded.includes("-----BEGIN") ? unwrap(decoded) : null;
}

/** A label from a BEGIN or END line; the pattern keeps it to the few words PEM types use. */
const LABEL = "([A-Z0-9]+(?: [A-Z0-9]+){0,4})";

export function readPrivateKey(raw: string): KeyReading {
  let text = unwrap(raw);
  if (!text) return problem("is empty");
  if (!text.includes("-----BEGIN")) {
    if (text.length < SHORTEST_KEY) {
      return problem(
        "is too short to be a private key and has no -----BEGIN line. It looks like a client secret or an ID: use a private key from the App's Key pairs section instead.",
      );
    }
    const decoded = decodedPem(text);
    if (!decoded) return problem("has no -----BEGIN line. Paste the whole .pem file, including its BEGIN and END lines.");
    text = decoded;
  }

  const begin = new RegExp(`-----BEGIN ${LABEL}-----`).exec(text);
  if (!begin) return problem("has a -----BEGIN line this site cannot read. Paste the whole .pem file again.");
  const label = begin[1];
  const format = FORMATS[label];
  if (!format) return problem(`is ${/^[AEIOU]/.test(label) ? "an" : "a"} ${label}, not an RSA private key. Use the .pem file from the App's Key pairs section (BEGIN RSA PRIVATE KEY).`);

  const rest = text.slice(begin.index + begin[0].length);
  const end = rest.indexOf(`-----END ${label}-----`);
  if (end === -1) return problem(`has no -----END ${label}----- line. It may have been cut short: paste the whole .pem file again.`);
  const inside = rest.slice(0, end);
  if (/Proc-Type:|DEK-Info:/.test(inside)) return problem("is encrypted with a passphrase. Use the key as GitHub issues it, unencrypted.");
  const body = inside.replace(/\s+/g, "");
  if (!body) return problem("has nothing between its BEGIN and END lines.");
  if (!BASE64.test(body) || body.length % 4 !== 0) {
    return problem("has characters between its BEGIN and END lines that are not base64. It may have been changed when it was pasted: paste the whole .pem file again.");
  }

  const pem = `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    // The parser's message can quote the key, so it is not passed on.
    return problem(`could not be read as ${format === "pkcs1" ? "a PKCS#1" : "a PKCS#8"} private key. It may have been cut short or changed: paste the whole .pem file again.`);
  }
  if (key.asymmetricKeyType !== "rsa") return problem(`is not an RSA key (its type is ${key.asymmetricKeyType}). GitHub App keys are RSA.`);
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  // Signing a JWT with RS256 needs at least this; GitHub issues 2048-bit keys.
  if (bits < MIN_BITS) return problem(`is an RSA key of ${bits} bits; it needs at least ${MIN_BITS}. Use the .pem file GitHub issued.`);
  return { ok: true, key, format, bits };
}

/** A key's kind and size, as Settings shows it. */
export function describeKey(reading: Extract<KeyReading, { ok: true }>): string {
  return `${reading.format === "pkcs1" ? "PKCS#1" : "PKCS#8"} RSA key, ${reading.bits} bits`;
}
