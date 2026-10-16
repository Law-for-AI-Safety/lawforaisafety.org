/**
 * A stand-in for `next/headers`, whose `cookies()` needs Next's request context. A test that
 * calls a route handler using cookies mocks the module with this:
 * `vi.mock("next/headers", () => import("../test/next-headers"))` (path relative to the test).
 * The browser's cookies live in `cookieJar`, which the test resets and asserts on.
 */
type StoredCookie = { value: string; options?: Record<string, unknown> };

const jar = new Map<string, StoredCookie>();

export const cookieJar = {
  /** The cookie as the route last set it, or undefined once it is deleted or never set. */
  get: (name: string) => jar.get(name),
  /** Puts a cookie in the jar as if the browser had sent it. */
  set: (name: string, value: string) => void jar.set(name, { value }),
  reset: () => jar.clear(),
};

export async function cookies() {
  return {
    get: (name: string) => {
      const cookie = jar.get(name);
      return cookie && { name, value: cookie.value };
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.set(name, { value, options });
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  };
}
