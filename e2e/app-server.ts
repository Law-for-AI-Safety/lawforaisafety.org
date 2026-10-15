import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

/** A free local port. */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/**
 * Starts the built app (`npm run build` first) with `next start` on `port`, with `env` added,
 * and waits until it answers. Its output is kept and shown if it does not start.
 */
export async function startApp(port: number, env: Record<string, string>): Promise<{ url: string; stop: () => void }> {
  const output: string[] = [];
  const child: ChildProcess = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
    env: { ...process.env, ...env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => output.push(String(d)));
  child.stderr?.on("data", (d) => output.push(String(d)));
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next start exited:\n${output.join("")}`);
    try {
      const response = await fetch(`${url}/robots.txt`);
      if (response.ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`next start did not answer within a minute:\n${output.join("")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { url, stop: () => child.kill() };
}
