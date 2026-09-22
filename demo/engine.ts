import { Browser, BrowserContext, Locator, Page } from 'playwright'
import { execSync, spawn, ChildProcess } from 'child_process'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { SPEED, BASE_URL } from './data'

// Ported from the Catalyse demo harness. Differences: auth is a cookie rather
// than a localStorage token, and scrolling targets whichever element actually
// scrolls — the task tracker scrolls an inner <div>, not the document.

// ─── Audio synthesis ──────────────────────────────────────────────────────────

const SR = 44100 // sample rate

interface SoundEvent {
  kind: 'click' | 'type'
  ms: number
}

interface NarrationClip {
  wavPath: string
  ms: number
}

export type DemoCookie = Parameters<BrowserContext['addCookies']>[0][number]

const SOUNDS_DIR = path.join(__dirname, 'sounds')
const TTS_CACHE_DIR = path.join(__dirname, '.tts-cache')
const TTS_VOICE = 'bf_emma'

const ANIM_STEP_MS = 50 // real wall-clock ms per animation step; long enough for screencast to capture

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function textToSeed(text: string): number {
  return crypto.createHash('sha256').update(text).digest().readUInt32LE(0)
}
const CAPTION_FADE_MS = 240
const SCROLL_PX_PER_SEC = 500 * SPEED // scale with SPEED so slower mode = slower scroll

const CAPTION_CSS = [
  'position:fixed',
  'bottom:32px',
  'left:50%',
  'transform:translateX(-50%)',
  'background:#16161d',
  'color:#f3f0ec',
  'padding:10px 28px',
  'border-radius:8px',
  'font-size:17px',
  'font-family:system-ui,sans-serif',
  'font-weight:500',
  'z-index:2147483647',
  'pointer-events:none',
  'max-width:75%',
  'text-align:center',
  'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
  'opacity:0',
  'transition:opacity 220ms ease',
].join(';')

// Cursor overlay — SVG arrow positioned via transform so updates hit the compositor layer.
// Also installs the scroller lookups used by smoothScrollTo/scrollPage.
// String (not function) so esbuild never injects __name() which would crash in browser context.
const INIT_SCRIPT = `
  (function() {
    window.__demoScrollerFor = function(el) {
      var n = el ? el.parentElement : null;
      while (n && n !== document.body && n !== document.documentElement) {
        var s = getComputedStyle(n).overflowY;
        if ((s === 'auto' || s === 'scroll') && n.scrollHeight > n.clientHeight) return n;
        n = n.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    };
    window.__demoMainScroller = function() {
      var best = document.scrollingElement || document.documentElement;
      var bestExtra = best.scrollHeight - best.clientHeight;
      document.querySelectorAll('body *').forEach(function(n) {
        var s = getComputedStyle(n).overflowY;
        if (s !== 'auto' && s !== 'scroll') return;
        var extra = n.scrollHeight - n.clientHeight;
        if (extra > bestExtra) { best = n; bestExtra = extra; }
      });
      return best;
    };

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><path d="M2 2 L2 26 L7 20 L11 30 L15 28 L11 18 L18 18 Z" fill="black" stroke="white" stroke-width="2" stroke-linejoin="round" paint-order="stroke fill"/></svg>';
    var url = 'data:image/svg+xml;base64,' + btoa(svg);
    var CSS = 'position:fixed;left:0;top:0;width:24px;height:32px;background-image:url(' + url + ');background-size:contain;background-repeat:no-repeat;pointer-events:none;z-index:2147483646;transform:translate(-200px,-200px)';
    function ensureCursor() {
      if (!document.body || document.getElementById('__demo-cursor__')) return;
      var el = document.createElement('div');
      el.id = '__demo-cursor__';
      el.style.cssText = CSS;
      document.body.appendChild(el);
    }
    var observer = new MutationObserver(ensureCursor);
    function start() {
      ensureCursor();
      observer.observe(document.body, { childList: true, subtree: false });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  })()
`

type DemoWindow = Window & {
  __demoScrollerFor: (el: Element | null) => Element
  __demoMainScroller: () => Element
}

export class DemoEngine {
  activePage: Page | null = null
  cursorX = -200
  cursorY = -200

  private phaseEvents: SoundEvent[] = []
  private narrationClips: NarrationClip[] = []
  private phaseStartMs = 0
  private typingPlayer: ChildProcess | null = null
  private readonly CLICK_CLIP: Float32Array
  private readonly TYPE_CLIP: Float32Array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ttsInitPromise: Promise<any> | null = null
  private detectMode = false
  private detectedTexts: string[] = []
  private readonly scratchDir: string
  private rng: () => number = Math.random
  private narrationIndex = 0
  private segments: string[] = []

  constructor(opts: { detectMode?: boolean; scratchDir: string }) {
    this.scratchDir = opts.scratchDir
    this.detectMode = opts.detectMode ?? false
    if (!this.detectMode) {
      this.CLICK_CLIP = this.loadClip(path.join(SOUNDS_DIR, 'click.mp3'))
      this.TYPE_CLIP = this.loadClip(path.join(SOUNDS_DIR, 'type.mp3'))
    } else {
      this.CLICK_CLIP = new Float32Array(0)
      this.TYPE_CLIP = new Float32Array(0)
    }
  }

  get isDetecting(): boolean {
    return this.detectMode
  }

  // ─── Narration (TTS) ───────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private initTTS(): Promise<any> {
    if (!this.ttsInitPromise) {
      this.ttsInitPromise = (async () => {
        const { KokoroTTS } = await import('kokoro-js')
        console.log('  Loading Kokoro TTS model (first run downloads ~90 MB)...')
        const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'q8',
          device: 'cpu',
        })
        console.log('  Kokoro TTS ready.')
        return tts
      })()
    }
    return this.ttsInitPromise
  }

  collectNarration(): string[] {
    return [...this.detectedTexts]
  }

  private ttsCachePath(text: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${TTS_VOICE}:${text}`)
      .digest('hex')
      .slice(0, 32)
    return path.join(TTS_CACHE_DIR, `${hash}.wav`)
  }

  /** Generate (or reuse cached) audio for a line of narration. */
  private async ensureNarration(text: string): Promise<string> {
    fs.mkdirSync(TTS_CACHE_DIR, { recursive: true })
    const wavPath = this.ttsCachePath(text)
    if (!fs.existsSync(wavPath)) {
      const tts = await this.initTTS()
      const audio = await tts.generate(text, { voice: TTS_VOICE })
      await audio.save(wavPath)
    }
    return wavPath
  }

  async pregenerateNarration(texts: string[]): Promise<void> {
    const unique = [...new Set(texts)]
    for (let i = 0; i < unique.length; i++) {
      const cached = fs.existsSync(this.ttsCachePath(unique[i]))
      if (!cached) process.stdout.write(`\n  Generating narration ${i + 1}/${unique.length}…`)
      await this.ensureNarration(unique[i])
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private makeStub(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const make = (): any =>
      new Proxy(function stub() {}, {
        get(_t, prop) {
          if (prop === 'then') return undefined // don't treat as Promise/thenable
          if (prop === Symbol.toPrimitive) return () => ''
          if (prop === 'toString') return () => ''
          if (prop === 'valueOf') return () => 0
          if (prop === 'all') return async () => []
          if (prop === 'isVisible') return async () => false
          if (prop === 'textContent') return async () => ''
          if (prop === 'boundingBox') return async () => null
          if (prop === 'json') return async () => make()
          if (prop === 'close') return async () => {}
          if (prop === 'url') return () => BASE_URL
          if (prop === 'video') return () => ({ path: async () => undefined })
          return make()
        },
        apply() {
          return make()
        },
      })
    return make()
  }

  // ─── Sound effects ─────────────────────────────────────────────────────────

  private loadClip(filePath: string): Float32Array {
    const raw = execSync(`ffmpeg -i "${filePath}" -f f32le -ar ${SR} -ac 1 pipe:1 2>/dev/null`, {
      maxBuffer: 100 * 1024 * 1024,
    })
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
  }

  private beginPhase(): void {
    this.phaseEvents = []
    this.narrationClips = []
    this.phaseStartMs = Date.now()
  }

  private addSound(kind: SoundEvent['kind'], atMs?: number): void {
    if (this.detectMode) return
    this.phaseEvents.push({ kind, ms: atMs ?? Date.now() - this.phaseStartMs })
    if (kind === 'click') this.playLive(path.join(SOUNDS_DIR, 'click.mp3'))
  }

  /** Headed runs play audio live through the speakers (macOS afplay) so you can follow along. */
  private playLive(file: string): ChildProcess | null {
    if (process.env.DEMO_HEADLESS || process.platform !== 'darwin') return null
    const player = spawn('afplay', [file], { stdio: 'ignore' })
    player.on('error', () => {})
    player.unref()
    return player
  }

  private startLiveTyping(): void {
    this.typingPlayer?.kill()
    this.typingPlayer = this.playLive(path.join(SOUNDS_DIR, 'type.mp3'))
  }

  private stopLiveTyping(): void {
    this.typingPlayer?.kill()
    this.typingPlayer = null
  }

  private overlayClip(pcm: Float32Array, clip: Float32Array, offsetSamples: number): void {
    for (let i = 0; i < clip.length; i++) {
      const j = offsetSamples + i
      if (j < pcm.length) pcm[j] = Math.max(-1, Math.min(1, pcm[j] + clip[i]))
    }
  }

  private buildWAV(events: SoundEvent[], narration: NarrationClip[], videoPath: string): string {
    const durSec = parseFloat(
      execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`)
        .toString()
        .trim(),
    )
    const total = Math.ceil(durSec * SR) + SR
    const pcm = new Float32Array(total)

    // Clicks: overlay each individually
    for (const ev of events.filter((e) => e.kind === 'click')) {
      this.overlayClip(pcm, this.CLICK_CLIP, Math.floor((ev.ms / 1000) * SR))
    }

    // Typing: group consecutive events (gap < 600 ms = same session), overlay one
    // continuous slice of TYPE_CLIP per session so it sounds like real sustained typing
    const typeEvents = events.filter((e) => e.kind === 'type').sort((a, b) => a.ms - b.ms)
    let clipCursor = 0
    let i = 0
    while (i < typeEvents.length) {
      const sessionStart = typeEvents[i].ms
      let sessionEnd = sessionStart
      while (i < typeEvents.length && typeEvents[i].ms - sessionEnd < 600) {
        sessionEnd = typeEvents[i].ms
        i++
      }
      const tailMs = 220 // let the last keypress ring out a little
      const durationSamples = Math.floor(((sessionEnd - sessionStart + tailMs) / 1000) * SR)
      const available = this.TYPE_CLIP.length - clipCursor
      const sliceSamples = Math.min(
        durationSamples,
        available > 0 ? available : this.TYPE_CLIP.length,
      )
      if (available <= 0) clipCursor = 0 // wrap if we exhaust the file
      const slice = this.TYPE_CLIP.slice(clipCursor, clipCursor + sliceSamples)
      this.overlayClip(pcm, slice, Math.floor((sessionStart / 1000) * SR))
      clipCursor += sliceSamples
    }

    // Narration: overlay pre-generated TTS clips
    for (const clip of narration) {
      if (!fs.existsSync(clip.wavPath)) continue
      const narPcm = this.loadClip(clip.wavPath)
      const scaled = new Float32Array(narPcm.length)
      for (let j = 0; j < narPcm.length; j++) scaled[j] = narPcm[j] * 0.85
      this.overlayClip(pcm, scaled, Math.floor((clip.ms / 1000) * SR))
    }

    const data = Buffer.alloc(total * 2)
    for (let i = 0; i < total; i++)
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), i * 2)

    const hdr = Buffer.alloc(44)
    hdr.write('RIFF', 0)
    hdr.writeUInt32LE(36 + data.length, 4)
    hdr.write('WAVE', 8)
    hdr.write('fmt ', 12)
    hdr.writeUInt32LE(16, 16)
    hdr.writeUInt16LE(1, 20) // PCM
    hdr.writeUInt16LE(1, 22) // mono
    hdr.writeUInt32LE(SR, 24)
    hdr.writeUInt32LE(SR * 2, 28)
    hdr.writeUInt16LE(2, 32)
    hdr.writeUInt16LE(16, 34)
    hdr.write('data', 36)
    hdr.writeUInt32LE(data.length, 40)

    const wavPath = videoPath.replace('.webm', '-sfx.wav')
    fs.writeFileSync(wavPath, Buffer.concat([hdr, data]))
    return wavPath
  }

  private mixAudioIntoClip(
    videoPath: string,
    events: SoundEvent[],
    narration: NarrationClip[],
  ): void {
    if (!fs.existsSync(videoPath)) return
    const wavPath = this.buildWAV(events, narration, videoPath)
    const tmp = videoPath + '.tmp.webm'
    try {
      execSync(
        `ffmpeg -y -i "${videoPath}" -i "${wavPath}" -map 0:v -map 1:a -c:v copy -c:a libopus "${tmp}"`,
        { stdio: 'pipe' },
      )
      fs.renameSync(tmp, videoPath)
    } catch {
      // libopus unavailable — fall back to no audio rather than crash
      console.warn('  Audio mix skipped (ffmpeg libopus not available)')
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    }
    fs.unlinkSync(wavPath)
  }

  // ─── Cursor ────────────────────────────────────────────────────────────────

  private parseCursorTransform(transform: string): [number, number] {
    const m = transform.match(/translate\(([0-9.-]+)px,\s*([0-9.-]+)px\)/)
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [200, 200]
  }

  /** Move cursor from its current position to (tx, ty) via bezier arc with jittered timing */
  async moveCursorToXY(tx: number, ty: number): Promise<void> {
    if (this.detectMode || !this.activePage) return
    const currentTransform: string = await this.activePage.evaluate(
      `(() => { var el = document.getElementById('__demo-cursor__'); return el ? (el.style.transform || 'translate(200px,200px)') : 'translate(200px,200px)'; })()`,
    )
    const [sx, sy] = this.parseCursorTransform(currentTransform)

    // Quadratic bezier control point: perpendicular offset ±40px for natural arc
    const dx = tx - sx
    const dy = ty - sy
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const perpScale = (this.rng() - 0.5) * 80
    const cpx = (sx + tx) / 2 + (-dy / len) * perpScale
    const cpy = (sy + ty) / 2 + (dx / len) * perpScale

    const totalMs = 350 / SPEED
    const steps = Math.max(1, Math.ceil(totalMs / ANIM_STEP_MS))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      const cx = Math.round((1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cpx + e * e * tx)
      const cy = Math.round((1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cpy + e * e * ty)
      await this.activePage.evaluate(
        `(function(){
          var el=document.getElementById('__demo-cursor__');
          if(el){ el.style.transform='translate(${cx}px,${cy}px)'; }
        })()`,
      )
      const jitterMs = ANIM_STEP_MS * (0.7 + this.rng() * 0.6)
      await new Promise((r) => setTimeout(r, jitterMs))
    }
    await this.activePage.mouse.move(tx, ty)
    this.cursorX = tx
    this.cursorY = ty
  }

  async mouseMoveTo(locator: Locator): Promise<void> {
    if (this.detectMode || !this.activePage) return
    const box = await locator.boundingBox()
    if (!box) return
    // Land at a random point within the middle 60% of the element
    const tx = box.x + box.width * (0.2 + this.rng() * 0.6)
    const ty = box.y + box.height * (0.2 + this.rng() * 0.6)
    await this.moveCursorToXY(tx, ty)
  }

  /**
   * Move the cursor left-to-right beneath a text element as if reading it.
   * pxPerSec controls reading speed.
   */
  async readText(locator: Locator, pxPerSec = 320): Promise<void> {
    if (this.detectMode || !this.activePage) return
    await this.smoothScrollTo(locator)
    const box = await locator.boundingBox()
    if (!box) return

    // Measure actual rendered text extent (first line) via Range API
    const textRect = await locator.evaluate((el: Element) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const rects = Array.from(range.getClientRects())
      if (!rects.length) return null
      const firstLine = rects[0]
      return { x: firstLine.x, width: firstLine.width, y: firstLine.y, height: firstLine.height }
    })

    const startX = (textRect?.x ?? box.x) + 2
    const endX = textRect ? textRect.x + textRect.width - 2 : box.x + box.width - 4
    const baseY = (textRect?.y ?? box.y) + (textRect?.height ?? box.height) * 0.8

    // Arc in to the start of the text
    await this.moveCursorToXY(startX, baseY)
    await this.pause(120)

    // Sweep left → right with sine ease-in-out and sinusoidal y-wobble
    const distance = endX - startX
    const totalMs = (distance / (pxPerSec * SPEED)) * 1000
    const steps = Math.max(1, Math.ceil(totalMs / ANIM_STEP_MS))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = (1 - Math.cos(Math.PI * t)) / 2
      const cx = Math.round(startX + distance * e)
      // Gentle sine wobble on y — simulates natural tracking movement
      const cy = Math.round(baseY + Math.sin(t * Math.PI * 3) * 4)
      await this.activePage.evaluate(
        `(function(){
          var el=document.getElementById('__demo-cursor__');
          if(el){ el.style.transform='translate(${cx}px,${cy}px)'; }
        })()`,
      )
      const jitterMs = ANIM_STEP_MS * (0.8 + this.rng() * 0.4)
      await new Promise((r) => setTimeout(r, jitterMs))
    }
    await this.activePage.mouse.move(endX, Math.round(baseY))
    this.cursorX = endX
    this.cursorY = Math.round(baseY)
  }

  /** Force-create/reposition the cursor arrow and move the physical mouse there */
  async placeCursor(x?: number, y?: number): Promise<void> {
    if (this.detectMode || !this.activePage) return
    x = x ?? this.cursorX
    y = y ?? this.cursorY
    this.cursorX = x
    this.cursorY = y
    await this.activePage.mouse.move(x, y)
    await this.activePage.evaluate(
      `(function() {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><path d="M2 2 L2 26 L7 20 L11 30 L15 28 L11 18 L18 18 Z" fill="black" stroke="white" stroke-width="2" stroke-linejoin="round" paint-order="stroke fill"/></svg>';
        var url = 'data:image/svg+xml;base64,' + btoa(svg);
        var el = document.getElementById('__demo-cursor__');
        if (!el) {
          el = document.createElement('div');
          el.id = '__demo-cursor__';
          document.body.appendChild(el);
        }
        el.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:32px;background-image:url(' + url + ');background-size:contain;background-repeat:no-repeat;pointer-events:none;z-index:2147483646;transform:translate(${x}px,${y}px)';
      })()`,
    )
  }

  /** Ripple animation at cursor position to indicate a click */
  async clickRipple(): Promise<void> {
    if (this.detectMode || !this.activePage) return
    const page = this.activePage
    const cursorTransform: string = await page.evaluate(
      `(function(){ var el=document.getElementById('__demo-cursor__'); return el ? el.style.transform : 'translate(200px,200px)'; })()`,
    )
    const [cx, cy] = this.parseCursorTransform(cursorTransform)
    // Expand from 0 to 36px and fade out over 400ms using step loop
    const duration = 400
    const steps = Math.max(1, Math.ceil(duration / ANIM_STEP_MS))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const size = Math.round(t * 36)
      const opacity = Math.round((1 - t) * 100) / 100
      const offset = Math.round(size / 2)
      await page
        .evaluate(
          `(function(){
          var el = document.getElementById('__demo-ripple__');
          if (!el) {
            el = document.createElement('div');
            el.id = '__demo-ripple__';
            document.body.appendChild(el);
          }
          el.style.cssText = 'position:fixed;left:0;top:0;border-radius:50%;border:2px solid rgba(27,51,76,0.9);pointer-events:none;z-index:2147483645;transform:translate(${cx - offset}px,${cy - offset}px);width:${size}px;height:${size}px;opacity:${opacity}';
        })()`,
        )
        // The click may have started a navigation that destroys this context mid-ripple.
        .catch(() => {})
      await new Promise((r) => setTimeout(r, ANIM_STEP_MS))
    }
    await page.evaluate(`document.getElementById('__demo-ripple__')?.remove()`).catch(() => {})
  }

  // ─── Captions ──────────────────────────────────────────────────────────────

  async showCaption(text: string): Promise<void> {
    if (this.detectMode || !this.activePage) return
    await this.activePage.evaluate(
      ([msg, css]: [string, string]) => {
        document.getElementById('__demo-caption__')?.remove()
        const div = document.createElement('div')
        div.id = '__demo-caption__'
        div.textContent = msg
        div.style.cssText = css
        document.body.appendChild(div)
        requestAnimationFrame(() => {
          div.style.opacity = '1'
        })
      },
      [text, CAPTION_CSS] as [string, string],
    )
  }

  async hideCaption(): Promise<void> {
    if (this.detectMode || !this.activePage) return
    await this.activePage
      .evaluate(() => {
        const div = document.getElementById('__demo-caption__')
        if (!div) return
        div.style.opacity = '0'
        setTimeout(() => div.remove(), 240)
      })
      .catch(() => {})
    await this.pause(CAPTION_FADE_MS)
  }

  async caption(text: string, durationMs = 2500): Promise<void> {
    if (this.detectMode) return
    await this.showCaption(text)
    await this.pause(durationMs)
    await this.hideCaption()
  }

  /**
   * Speak a line of narration with a matching caption. If action is provided,
   * it runs while the line plays, and any time left over is padded out so the
   * next step never talks over this one. A page navigation inside `action`
   * drops the caption — keep navigations at the end of an action, or narrate
   * after them.
   */
  async narrate(text: string, action?: () => Promise<void>): Promise<void> {
    if (this.detectMode) {
      this.detectedTexts.push(text)
      if (action) await action()
      return
    }

    // Reseed RNG from this narration so cursor paths are deterministic
    // and independent of changes to other narrations
    this.rng = mulberry32(textToSeed(`${this.narrationIndex++}:${text}`))

    const wavPath = await this.ensureNarration(text)
    const ttsDurationMs =
      parseFloat(
        execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${wavPath}"`)
          .toString()
          .trim(),
      ) * 1000

    await this.showCaption(text)
    this.narrationClips.push({ wavPath, ms: Date.now() - this.phaseStartMs })
    this.playLive(wavPath)

    const actionStart = Date.now()
    if (action) await action()
    const remaining = ttsDurationMs - (Date.now() - actionStart)
    if (remaining > 0) await this.pause(remaining)

    await this.hideCaption()
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async pause(ms: number): Promise<void> {
    if (this.detectMode) return
    await new Promise((r) => setTimeout(r, ms / SPEED))
  }

  /**
   * Navigate to url, cover the load with a one-shot black overlay, then inject the
   * title card HTML as a full-screen iframe (above cursor) so the app page is ready underneath.
   * Call dismissTitleCard() to crossfade directly to the app with no black intermediate.
   */
  async showTitleCard(url: string, html: string): Promise<void> {
    if (this.detectMode || !this.activePage) return
    // addInitScript fires before every paint — sessionStorage guard makes it one-shot
    await this.activePage.addInitScript(`
      (function() {
        if (sessionStorage.getItem('__tc__')) return;
        var o = document.createElement('div');
        o.id = '__demo-tc-cover__';
        o.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;pointer-events:none;';
        document.documentElement.appendChild(o);
      })()
    `)
    await this.activePage.goto(url)
    await this.activePage.evaluate((htmlContent: string) => {
      sessionStorage.setItem('__tc__', '1')
      const iframe = document.createElement('iframe')
      iframe.id = '__demo-title-card__'
      iframe.srcdoc = htmlContent
      iframe.style.cssText =
        'position:fixed;inset:0;width:100%;height:100%;border:none;z-index:2147483647;pointer-events:none;opacity:1'
      document.body.appendChild(iframe)
      document.getElementById('__demo-tc-cover__')?.remove()
    }, html)
  }

  /** Fade the title card iframe out, revealing the app page underneath. */
  async dismissTitleCard(durationMs = 600): Promise<void> {
    if (this.detectMode || !this.activePage) return
    await this.activePage.evaluate((ms: number) => {
      const el = document.getElementById('__demo-title-card__') as HTMLElement | null
      if (!el) return
      el.style.transition = `opacity ${ms}ms ease`
      el.style.opacity = '0'
      setTimeout(() => el.remove(), ms + 20)
    }, durationMs)
    await this.pause(durationMs)
  }

  async fadeOut(durationMs = 600): Promise<void> {
    if (this.detectMode || !this.activePage) return
    await this.activePage.evaluate(`(function(){
      var o=document.createElement('div');
      o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity ${durationMs}ms ease';
      document.body.appendChild(o);
      requestAnimationFrame(function(){ o.style.opacity='1'; });
    })()`)
    await this.pause(durationMs + 100)
  }

  /** Scroll whichever element contains `locator` until it sits mid-viewport. */
  async smoothScrollTo(locator: Locator): Promise<void> {
    if (this.detectMode || !this.activePage) return
    const plan = await locator
      .evaluate((el: Element) => {
        // Skip if inside a fixed-position ancestor (e.g. sticky bar, modal)
        for (let n: Element | null = el; n; n = n.parentElement) {
          if (window.getComputedStyle(n).position === 'fixed') return null
        }
        const scroller = (window as unknown as DemoWindow).__demoScrollerFor(el)
        const isDocument = scroller === (document.scrollingElement || document.documentElement)
        const view = isDocument
          ? { top: 0, height: window.innerHeight }
          : scroller.getBoundingClientRect()
        const box = el.getBoundingClientRect()
        // Already comfortably visible (80px margin each edge)
        const margin = 80
        if (box.top >= view.top + margin && box.bottom <= view.top + view.height - margin)
          return null
        const target = scroller.scrollTop + (box.top - view.top) - view.height / 2 + box.height / 2
        const max = scroller.scrollHeight - scroller.clientHeight
        return { start: scroller.scrollTop, target: Math.max(0, Math.min(max, target)) }
      })
      .catch(() => null)
    if (!plan) return

    const distance = plan.target - plan.start
    if (Math.abs(distance) < 2) return

    const totalMs = (Math.abs(distance) / SCROLL_PX_PER_SEC) * 1000
    const steps = Math.max(1, Math.ceil(totalMs / ANIM_STEP_MS))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      // Ease-in-out + tiny ±2px noise so scroll feels hand-driven
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      const noise = (this.rng() - 0.5) * 4
      const y = Math.round(plan.start + distance * e + (i < steps ? noise : 0))
      await locator.evaluate((el: Element, top: number) => {
        ;(window as unknown as DemoWindow).__demoScrollerFor(el).scrollTop = top
      }, y)
      // Variable step delay ±30%
      const jitterMs = ANIM_STEP_MS * (0.7 + this.rng() * 0.6)
      await new Promise((r) => setTimeout(r, jitterMs))
    }
    await this.pause(200)
  }

  /** Smooth-scroll the page's main scroll area by up to maxPx, over durationMs of real time. */
  async scrollPage(
    maxPx = 1200,
    durationMs = 3000,
    direction: 'down' | 'up' = 'down',
  ): Promise<void> {
    if (this.detectMode || !this.activePage) return
    const { start, max } = await this.activePage.evaluate(() => {
      const scroller = (window as unknown as DemoWindow).__demoMainScroller()
      return { start: scroller.scrollTop, max: scroller.scrollHeight - scroller.clientHeight }
    })
    const end = direction === 'down' ? Math.min(max, start + maxPx) : Math.max(0, start - maxPx)
    const distance = end - start
    if (Math.abs(distance) < 2) return
    const steps = Math.max(1, Math.ceil(durationMs / ANIM_STEP_MS))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = (1 - Math.cos(Math.PI * t)) / 2
      await this.activePage.evaluate((top: number) => {
        ;(window as unknown as DemoWindow).__demoMainScroller().scrollTop = top
      }, Math.round(start + distance * e))
      await new Promise((r) => setTimeout(r, ANIM_STEP_MS * (0.8 + this.rng() * 0.4)))
    }
  }

  /** Click a visible link to `url` if there is one; otherwise fade out, jump there, fade back in. */
  async navigateTo(url: string): Promise<void> {
    if (this.detectMode || !this.activePage) return
    const urlPath = url.replace(BASE_URL, '') || '/'

    const link = this.activePage.locator(`a[href="${urlPath}"], a[href="${url}"]`).first()
    const linkVisible = await link.isVisible({ timeout: 500 }).catch(() => false)
    if (linkVisible) {
      await this.click(link, { navigatesTo: url })
      return
    }

    // Fresh segment: about:blank has no storage and nothing to fade from.
    if (this.activePage.url() === 'about:blank') {
      await this.activePage.goto(url)
      await this.placeCursor()
      return
    }

    await this.activePage.evaluate(`(function(){
      var o=document.createElement('div');
      o.id='__demo-overlay__';
      o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 300ms ease';
      document.body.appendChild(o);
      requestAnimationFrame(function(){ o.style.opacity='1'; });
    })()`)
    await this.pause(350)
    await this.activePage.addInitScript(`
      (function() {
        if (sessionStorage.getItem('__nav__') !== '1') return;
        sessionStorage.removeItem('__nav__');
        var o = document.createElement('div');
        o.id = '__demo-overlay__';
        o.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483645;pointer-events:none;';
        document.documentElement.appendChild(o);
      })()
    `)
    await this.activePage.evaluate(`sessionStorage.setItem('__nav__', '1')`)
    await this.activePage.goto(url)
    await this.placeCursor()
    await this.activePage.evaluate(`(function(){
      var el=document.getElementById('__demo-overlay__');
      if(!el)return;
      el.style.transition='opacity 400ms ease';
      el.style.opacity='0';
      setTimeout(function(){ el.remove(); }, 420);
    })()`)
    await this.pause(450)
  }

  /** Hover → click → type character by character */
  async type(locator: Locator, text: string, charDelayMs = 55): Promise<void> {
    if (this.detectMode) return
    await this.smoothScrollTo(locator)
    await this.mouseMoveTo(locator)
    await this.pause(150)
    this.addSound('click')
    await locator.click()
    void this.clickRipple()
    // Move cursor clear of the field so typed text is visible
    const box = await locator.boundingBox()
    if (box)
      await this.moveCursorToXY(box.x + box.width * 0.75, box.y + box.height + 40 + this.rng() * 20)
    await this.pause(400)
    // Pre-schedule a keypress sound per character relative to now
    const typeStartMs = Date.now() - this.phaseStartMs
    const actualDelay = charDelayMs / SPEED
    for (let i = 0; i < text.length; i++) this.addSound('type', typeStartMs + i * actualDelay)
    this.startLiveTyping()
    await locator.focus()
    await locator.pressSequentially(text, { delay: actualDelay })
    this.stopLiveTyping()
  }

  /** Hover, click, and wait for the navigation when you know where the click goes. */
  async click(locator: Locator, opts: { navigatesTo?: string | RegExp } = {}): Promise<void> {
    if (this.detectMode || !this.activePage) return
    await this.smoothScrollTo(locator)
    await this.mouseMoveTo(locator)
    await this.pause(200)
    this.addSound('click')

    if (opts.navigatesTo) {
      await Promise.all([
        this.activePage.waitForURL(opts.navigatesTo, { timeout: 15_000 }),
        locator.click(),
      ])
      await this.activePage.waitForLoadState('domcontentloaded')
      await this.placeCursor()
      return
    }

    await locator.click()
    await this.clickRipple()
  }

  /** Pick an option in a native <select>. Native dropdowns don't show up in a screencast, so this just hovers and sets it. */
  async select(locator: Locator, label: string): Promise<void> {
    if (this.detectMode) return
    await this.smoothScrollTo(locator)
    await this.mouseMoveTo(locator)
    await this.pause(200)
    this.addSound('click')
    void this.clickRipple()
    await locator.selectOption({ label })
    await this.pause(300)
  }

  // ─── Segments ──────────────────────────────────────────────────────────────

  /** Create a new browser context + page, set activePage, start a new audio phase. */
  async beginSegment(
    browser: Browser,
    options: { cookies?: DemoCookie[] } = {},
  ): Promise<{ ctx: BrowserContext; page: Page }> {
    if (this.detectMode) {
      const stub = this.makeStub()
      this.activePage = stub
      this.beginPhase()
      return { ctx: stub, page: stub }
    }
    const ctx = await browser.newContext({
      recordVideo: { dir: this.scratchDir, size: { width: 1280, height: 800 } },
      viewport: { width: 1280, height: 800 },
      locale: 'en-GB',
      timezoneId: 'Europe/London',
    })
    await ctx.addInitScript(INIT_SCRIPT)
    if (options.cookies) await ctx.addCookies(options.cookies)
    const page = await ctx.newPage()
    this.activePage = page
    this.beginPhase()
    return { ctx, page }
  }

  /**
   * End a segment: optionally fade to black, capture the video, mix audio, track the clip.
   * transition defaults to 'fade-out'. Use 'cut' to close immediately with no animation.
   */
  async endSegment(
    ctx: BrowserContext,
    options: { transition?: 'fade-out' | 'cut'; transitionDurationMs?: number } = {},
  ): Promise<void> {
    if (this.detectMode) {
      this.activePage = null
      return
    }
    const { transition = 'fade-out', transitionDurationMs = 600 } = options

    if (transition === 'fade-out' && this.activePage) {
      await this.fadeOut(transitionDurationMs)
    }

    const videoPath = await this.activePage?.video()?.path()
    const events = [...this.phaseEvents]
    const narration = [...this.narrationClips]
    await ctx.close()
    this.activePage = null

    if (videoPath) {
      const idx = this.segments.length
      const clipPath = path.join(this.scratchDir, `clip-${idx.toString().padStart(2, '0')}.webm`)
      fs.renameSync(videoPath, clipPath)
      this.mixAudioIntoClip(clipPath, events, narration)
      this.segments.push(clipPath)
    }
  }

  /** Concatenate all recorded segments into a single .webm, then transcode to .mp4. */
  async compile(outputPath: string): Promise<void> {
    if (this.segments.length === 0) {
      console.warn('No segments to compile.')
      return
    }
    const concatFile = path.join(this.scratchDir, 'concat.txt')
    fs.writeFileSync(concatFile, this.segments.map((f) => `file '${f}'`).join('\n'))
    console.log(`\nMerging ${this.segments.length} segment(s) → ${outputPath}`)
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}"`, {
      stdio: 'pipe',
    })

    const mp4Path = outputPath.replace(/\.webm$/, '.mp4')
    console.log(`Transcoding → ${mp4Path}`)
    execSync(
      `ffmpeg -y -i "${outputPath}" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${mp4Path}"`,
      { stdio: 'pipe' },
    )
    console.log('Done.')
  }
}
