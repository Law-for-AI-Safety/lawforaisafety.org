/**
 * Debounced autosave of the page draft. Each save carries the draft version it started from;
 * the server refuses it when the draft has moved on (another editor saved), and autosaving
 * then stops with a conflict so nothing is overwritten. Saves run one at a time, each from
 * the version the previous one returned. There is no polling: a conflict is found only when
 * this editor saves.
 */

export type SaveResult =
  | { ok: true; version: number }
  /** Not saved, but a later attempt may work (for example once signed in again). */
  | { ok: false; reason: "retry"; message: string }
  /** Not saved, and saving stops. */
  | { ok: false; reason: "conflict" | "forbidden" | "invalid"; message: string };

export type AutosaveStatus =
  /** Everything typed is saved. */
  | { state: "saved" }
  /** A change is waiting for the debounce, or for the save in flight. */
  | { state: "pending" }
  | { state: "saving" }
  /** The last save failed for a reason a retry may fix; the change is kept. */
  | { state: "error"; message: string }
  /** Stopped for good: another editor saved first, or the server refused this editor. */
  | { state: "conflict" | "forbidden" | "invalid"; message: string };

export type AutosaveOptions<T> = {
  version: number;
  save: (value: T, version: number) => Promise<SaveResult>;
  onStatus: (status: AutosaveStatus) => void;
  /** Called with each version the server confirms. */
  onSaved?: (version: number) => void;
  delayMs?: number;
};

export const AUTOSAVE_DELAY_MS = 1000;

export class Autosaver<T> {
  private confirmed: number;
  private latest: { value: T } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = false;
  private readonly options: AutosaveOptions<T>;

  constructor(options: AutosaveOptions<T>) {
    this.options = options;
    this.confirmed = options.version;
  }

  /** The draft version the server last confirmed. */
  get version(): number {
    return this.confirmed;
  }

  /** Records a change and saves it once no other change arrives for the debounce delay. */
  change(value: T): void {
    if (this.stopped) return;
    this.latest = { value };
    this.options.onStatus({ state: "pending" });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.delayMs ?? AUTOSAVE_DELAY_MS);
  }

  /** Whether a change has not reached the server yet. */
  get dirty(): boolean {
    return this.latest !== null || this.inFlight !== null;
  }

  /** Saves the latest change now, after any save in flight. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.inFlight) await this.inFlight;
    if (this.stopped || !this.latest) return;
    const { value } = this.latest;
    this.latest = null;
    let sent = false;
    this.inFlight = this.send(value).then((ok) => {
      sent = ok;
    });
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
    // A change made while that save was in flight follows straight on. After a failure, the
    // next change or a retry sends it.
    if (sent && this.latest && !this.timer) await this.flush();
  }

  /** Sends one save; true when the server accepted it. */
  private async send(value: T): Promise<boolean> {
    this.options.onStatus({ state: "saving" });
    let result: SaveResult;
    try {
      result = await this.options.save(value, this.confirmed);
    } catch {
      result = { ok: false, reason: "retry", message: "Could not save. Check your connection; your changes are kept here." };
    }
    if (!result.ok && result.reason === "retry") {
      // Kept unless a newer change replaced it, so the next change or a retry sends it.
      this.latest ??= { value };
      this.options.onStatus({ state: "error", message: result.message });
      return false;
    }
    if (result.ok) {
      this.confirmed = result.version;
      this.options.onSaved?.(result.version);
      this.options.onStatus(this.latest ? { state: "pending" } : { state: "saved" });
      return true;
    }
    this.stopped = true;
    this.latest = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.options.onStatus({ state: result.reason, message: result.message });
    return false;
  }

  /** Stops the timer; nothing more is saved. */
  dispose(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
