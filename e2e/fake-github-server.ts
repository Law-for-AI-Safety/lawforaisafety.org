import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { FakeGitHub } from "../test/fakes/github";

/**
 * The fake GitHub from test/fakes/github.ts, served over HTTP on a free local port, so the app
 * running in another process (`next start`) reaches it through `GITHUB_API_URL`. The test
 * holds the same object and asserts on it directly.
 */
export async function serveFakeGitHub(): Promise<{ github: FakeGitHub; url: string; close: () => Promise<void> }> {
  const github = new FakeGitHub();
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    try {
      const response = await github.handle(
        new Request(`http://127.0.0.1${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      // A simulated network failure: drop the connection.
      res.destroy();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    github,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
