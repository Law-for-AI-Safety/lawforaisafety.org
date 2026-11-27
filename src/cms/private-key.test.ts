import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describeKey, readPrivateKey } from "./private-key";

/**
 * Reading the App's key in the forms hosts store it in, with keys made here: no real key is
 * ever in the repo. Each accepted form must give a key that signs what the original key's
 * public half verifies.
 */

function rsaKeys(type: "pkcs1" | "pkcs8") {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type, format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

const pkcs1 = rsaKeys("pkcs1");
const pkcs8 = rsaKeys("pkcs8");

/** The base64 body of a PEM, which a problem must never quote any part of. */
const bodyOf = (pem: string) => pem.split("\n").filter((line) => line && !line.startsWith("-----")).join("");

function expectSigns(stored: string, publicPem: string) {
  const reading = readPrivateKey(stored);
  if (!reading.ok) throw new Error(reading.problem);
  const signature = sign("sha256", Buffer.from("hello"), reading.key);
  expect(verify("sha256", Buffer.from("hello"), createPublicKey(publicPem), signature)).toBe(true);
  return reading;
}

function expectProblem(stored: string, problem: string | RegExp) {
  const reading = readPrivateKey(stored);
  expect(reading.ok).toBe(false);
  const text = (reading as { problem: string }).problem;
  expect(text).toMatch(problem);
  expect(text.startsWith("GITHUB_APP_PRIVATE_KEY ")).toBe(true);
  // No run of key material, however short, appears in what is shown.
  const material = stored.replace(/-----(BEGIN|END) [A-Za-z0-9 ]+-----/g, " ").split(/\s+|\\n/);
  for (const run of material) if (run.length >= 8) expect(text).not.toContain(run.slice(0, 8));
  return text;
}

describe.each([
  ["PKCS#1, as GitHub issues it", pkcs1, "pkcs1"],
  ["PKCS#8", pkcs8, "pkcs8"],
] as const)("a %s key", (_name, keys, format) => {
  const pem = keys.privateKey;
  const lines = pem.trimEnd().split("\n");

  it.each([
    ["as the .pem file", pem],
    ["with \\n escapes on one line", lines.join("\\n")],
    ["with \\r\\n escapes", lines.join("\\r\\n")],
    ["with Windows line breaks", lines.join("\r\n")],
    ["with old Mac line breaks", lines.join("\r")],
    ["with its line breaks turned into spaces", lines.join(" ")],
    ["with its line breaks lost", lines.join("")],
    ["in double quotes", `"${lines.join("\\n")}"`],
    ["in single quotes, with whitespace around", `  '${pem}'  \n`],
    ["in quotes inside quotes", `"'${pem}'"`],
    ["with its body as one long line", `${lines[0]}\n${lines.slice(1, -1).join("")}\n${lines.at(-1)}`],
    ["with blank lines and indents", lines.map((l) => `   ${l}  `).join("\n\n")],
    ["base64-encoded whole", Buffer.from(pem).toString("base64")],
    ["base64-encoded whole, wrapped", Buffer.from(pem).toString("base64").replace(/.{76}/g, "$&\n")],
    ["base64-encoded with \\n escapes inside", Buffer.from(lines.join("\\n")).toString("base64")],
  ])("is read %s", (_how, stored) => {
    const reading = expectSigns(stored, keys.publicKey);
    expect(reading).toMatchObject({ format, bits: 2048 });
  });

  it("is described by its kind and size", () => {
    const reading = readPrivateKey(pem);
    expect(reading.ok && describeKey(reading)).toBe(`${format === "pkcs1" ? "PKCS#1" : "PKCS#8"} RSA key, 2048 bits`);
  });
});

describe("a value that is not a usable key", () => {
  const lines = pkcs1.privateKey.trimEnd().split("\n");
  const body = bodyOf(pkcs1.privateKey);

  it("is empty", () => {
    expectProblem("  \"\"  ", "GITHUB_APP_PRIVATE_KEY is empty");
  });

  it("looks like an OAuth client secret", () => {
    expectProblem("0123456789abcdef0123456789abcdef01234567", /too short to be a private key.*client secret/);
  });

  it("is the body alone, without its BEGIN and END lines", () => {
    expectProblem(body, /has no -----BEGIN line/);
  });

  it("is long text that is neither a PEM nor base64", () => {
    expectProblem("not a key, ".repeat(30), /has no -----BEGIN line/);
  });

  it("is base64 of something other than a PEM", () => {
    expectProblem(Buffer.from("x".repeat(300)).toString("base64"), /has no -----BEGIN line/);
  });

  it("has a BEGIN line that is mangled", () => {
    expectProblem(["-----BEGIN rsa private key-----", ...lines.slice(1)].join("\n"), /BEGIN line this site cannot read/);
  });

  it.each([
    ["PUBLIC KEY", pkcs1.publicKey],
    ["CERTIFICATE", "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----"],
    ["OPENSSH PRIVATE KEY", "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE=\n-----END OPENSSH PRIVATE KEY-----"],
    ["ENCRYPTED PRIVATE KEY", "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIB\n-----END ENCRYPTED PRIVATE KEY-----"],
  ])("is a %s", (label, stored) => {
    expectProblem(stored, `GITHUB_APP_PRIVATE_KEY is ${/^[AEIOU]/.test(label) ? "an" : "a"} ${label}, not an RSA private key`);
  });

  it("is cut short before its END line", () => {
    expectProblem(lines.slice(0, 10).join("\n"), "has no -----END RSA PRIVATE KEY----- line");
  });

  it("has an END line of another type", () => {
    expectProblem([...lines.slice(0, -1), "-----END PRIVATE KEY-----"].join("\n"), "has no -----END RSA PRIVATE KEY----- line");
  });

  it("is encrypted with a passphrase", () => {
    expectProblem([lines[0], "Proc-Type: 4,ENCRYPTED", "DEK-Info: AES-128-CBC,00112233445566778899AABBCCDDEEFF", "", ...lines.slice(1)].join("\n"), /encrypted with a passphrase/);
  });

  it("has nothing between its BEGIN and END lines", () => {
    expectProblem("-----BEGIN RSA PRIVATE KEY-----\n\n-----END RSA PRIVATE KEY-----", "has nothing between its BEGIN and END lines");
  });

  it.each([
    ["characters outside base64", [lines[0], `${lines[1].slice(0, 30)}*${lines[1].slice(31)}`, ...lines.slice(2)].join("\n")],
    ["a broken length", [lines[0], lines[1].slice(1), ...lines.slice(2)].join("\n")],
  ])("has %s in its body", (_what, stored) => {
    expectProblem(stored, /not base64/);
  });

  it("is a PKCS#1 key cut short inside its body", () => {
    const text = expectProblem([lines[0], ...lines.slice(1, 6), lines.at(-1)].join("\n"), "could not be read as a PKCS#1 private key");
    expect(text).not.toContain(body.slice(0, 12));
  });

  it("is an EC key, which GitHub Apps do not use", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    expectProblem(ec.privateKey, "is not an RSA key (its type is ec)");
  });

  it("is an RSA key too small to sign with", () => {
    const small = generateKeyPairSync("rsa", { modulusLength: 1024, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    expectProblem(small.privateKey, "is an RSA key of 1024 bits; it needs at least 2048");
  });

  it("is a PKCS#8 key cut short", () => {
    const short = pkcs8.privateKey.trimEnd().split("\n");
    expectProblem([short[0], ...short.slice(1, 6), short.at(-1)].join("\n"), "could not be read as a PKCS#8 private key");
  });
});
