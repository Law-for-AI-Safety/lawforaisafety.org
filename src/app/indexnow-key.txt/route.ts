import { indexNowKey } from "@/lib/indexnow";

/**
 * The IndexNow key file (src/lib/indexnow.ts). It sits at the site root, so the engines accept
 * pings for any URL on the site. The key comes from `INDEXNOW_KEY` and is read on each request;
 * without one there is nothing to serve.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const key = indexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
