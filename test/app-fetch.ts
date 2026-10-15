/**
 * Serves a `fetch` to the app's own origin from the real route handler under
 * `src/app/api/`, as Next would, minus the network. A component test then exercises the
 * browser code, the route, and the database together. Handlers that need Next's request
 * context (`cookies()`, `headers()`) cannot run here.
 */
export const APP_ORIGIN = "http://localhost:3000";

type RouteModule = Record<
  string,
  (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>
>;

const modules = import.meta.glob("/src/app/api/**/route.ts") as Record<
  string,
  () => Promise<RouteModule>
>;

/** `/src/app/api/a/[id]/route.ts` becomes a pattern matching `/api/a/<id>`. */
const routes = Object.entries(modules).map(([file, load]) => {
  const segments = file.replace(/^\/src\/app/, "").replace(/\/route\.ts$/, "").split("/");
  const names: string[] = [];
  const pattern = segments
    .map((segment) => {
      const param = segment.match(/^\[(\w+)\]$/);
      if (!param) return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      names.push(param[1]);
      return "([^/]+)";
    })
    .join("/");
  return { regex: new RegExp(`^${pattern}$`), names, load };
});

export async function appFetch(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  for (const { regex, names, load } of routes) {
    const match = pathname.match(regex);
    if (!match) continue;
    const handler = (await load())[request.method];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    const params = Object.fromEntries(names.map((name, i) => [name, match[i + 1]]));
    return handler(request, { params: Promise.resolve(params) });
  }
  throw new Error(`A test fetched ${request.method} ${pathname}, which has no route handler.`);
}
