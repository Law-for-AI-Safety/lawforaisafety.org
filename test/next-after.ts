/**
 * Stands in for `after()` from `next/server`, which needs Next's request scope. A task starts
 * at once, as Next would start it once the response is sent, and `afterTasks.settled()` waits
 * for every task started so far, so a test can assert on what they did.
 * `test/setup-env.ts` installs it and empties it before each test.
 */
type AfterTask = Promise<unknown> | (() => unknown);

class AfterTasks {
  private pending: Promise<unknown>[] = [];

  run(task: AfterTask): void {
    this.pending.push(typeof task === "function" ? Promise.resolve().then(task) : task);
  }

  async settled(): Promise<void> {
    while (this.pending.length > 0) await Promise.all(this.pending.splice(0));
  }

  reset(): void {
    this.pending = [];
  }
}

export const afterTasks = new AfterTasks();

export function after(task: AfterTask): void {
  afterTasks.run(task);
}
