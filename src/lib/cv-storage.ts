import { getStore } from "@netlify/blobs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PDF_MAGIC_BYTES = "%PDF-";
const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB

// @netlify/blobs needs a live Netlify link (siteID + token), only present
// when actually deployed or running via `netlify dev`. Plain `next dev`
// doesn't have that context, so fall back to local disk storage — keeps
// `npm run dev` self-contained, same reasoning as the Dockerized Postgres.
const LOCAL_BLOBS_DIR = join(process.cwd(), ".local-blobs", "cvs");

function usingRealBlobs(): boolean {
  return Boolean(process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY);
}

function store() {
  return getStore("cvs");
}

function localFilePath(key: string): string {
  return join(LOCAL_BLOBS_DIR, key.replaceAll("/", "_"));
}

export function cvBlobKey(applicationId: string): string {
  return `cv/${applicationId}`;
}

export async function validatePdf(file: File): Promise<void> {
  if (file.size > MAX_CV_BYTES) {
    throw new Error("CV exceeds 5 MB limit");
  }

  const headerBytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const header = new TextDecoder().decode(headerBytes);
  if (header !== PDF_MAGIC_BYTES) {
    throw new Error("File is not a valid PDF");
  }
}

export async function storeCv(
  applicationId: string,
  file: File,
): Promise<string> {
  const key = cvBlobKey(applicationId);
  const data = await file.arrayBuffer();

  if (usingRealBlobs()) {
    await store().set(key, data, {
      metadata: { contentType: "application/pdf" },
    });
  } else {
    await mkdir(LOCAL_BLOBS_DIR, { recursive: true });
    await writeFile(localFilePath(key), Buffer.from(data));
  }

  return key;
}

export async function getCv(blobKey: string): Promise<ArrayBuffer | null> {
  if (usingRealBlobs()) {
    return store().get(blobKey, { type: "arrayBuffer" });
  }
  try {
    const buffer = await readFile(localFilePath(blobKey));
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
  } catch {
    return null;
  }
}

export async function deleteCv(blobKey: string): Promise<void> {
  if (usingRealBlobs()) {
    await store().delete(blobKey);
    return;
  }
  await rm(localFilePath(blobKey), { force: true });
}
