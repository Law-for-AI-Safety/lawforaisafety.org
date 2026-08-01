import { getStore } from "@netlify/blobs";

const PDF_MAGIC_BYTES = "%PDF-";
const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB

function store() {
  return getStore("cvs");
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
  await store().set(key, await file.arrayBuffer(), {
    metadata: { contentType: "application/pdf" },
  });
  return key;
}

export async function getCv(blobKey: string): Promise<ArrayBuffer | null> {
  return store().get(blobKey, { type: "arrayBuffer" });
}

export async function deleteCv(blobKey: string): Promise<void> {
  await store().delete(blobKey);
}
