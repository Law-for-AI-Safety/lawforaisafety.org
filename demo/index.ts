import { chromium, Browser } from 'playwright'
import path from 'path'
import fs from 'fs'
import { buildForDemo, prepareDemoDatabase, startDemoServer, stopDemoServer } from './server'
import { DemoEngine } from './engine'
import * as taskTrackerFlow from './flows/task-tracker'

type FlowModule = {
  meta: { name: string; title: string }
  run: (engine: DemoEngine, browser: Browser) => Promise<void>
}

const ALL_FLOWS: FlowModule[] = [taskTrackerFlow]

async function main() {
  const args = process.argv.slice(2)
  const skipBuild = args.includes('--skip-build')
  const flowArg = args.find((arg) => !arg.startsWith('--'))

  let flowsToRun: FlowModule[]
  if (flowArg) {
    const found = ALL_FLOWS.find((f) => f.meta.name === flowArg)
    if (!found) {
      console.error(
        `Unknown flow: "${flowArg}". Available: ${ALL_FLOWS.map((f) => f.meta.name).join(', ')}`,
      )
      process.exit(1)
    }
    flowsToRun = [found]
  } else {
    process.env.DEMO_HEADLESS = 'true'
    flowsToRun = ALL_FLOWS
  }
  if (args.includes('--headless')) process.env.DEMO_HEADLESS = 'true'

  if (skipBuild) {
    console.log('Skipping build (--skip-build) — recording whatever is in .next/.')
  } else {
    console.log('Building for demo...')
    await buildForDemo()
  }

  for (const flow of flowsToRun) {
    console.log(`\n=== Running flow: ${flow.meta.name} ===`)
    const scratchDir = path.join(__dirname, '.scratch', flow.meta.name)
    fs.rmSync(scratchDir, { recursive: true, force: true })
    fs.mkdirSync(scratchDir, { recursive: true })

    // Dry run to collect every narration line, so TTS can be generated while
    // the database and server come up.
    const detectEngine = new DemoEngine({ detectMode: true, scratchDir })
    await flow.run(detectEngine, null as unknown as Browser)
    const texts = detectEngine.collectNarration()
    console.log(`  Found ${texts.length} narration lines.`)

    const engine = new DemoEngine({ scratchDir })
    process.stdout.write('  Preparing database, server and narration...')
    await Promise.all([
      engine.pregenerateNarration(texts),
      prepareDemoDatabase().then(startDemoServer),
    ])
    console.log(' ready.')

    try {
      const browser = await chromium.launch({ headless: !!process.env.DEMO_HEADLESS })
      try {
        await flow.run(engine, browser)
      } finally {
        await browser.close()
      }

      const outputDir = path.join(__dirname, 'output')
      fs.mkdirSync(outputDir, { recursive: true })
      await engine.compile(path.join(outputDir, `${flow.meta.name}.webm`))
    } finally {
      stopDemoServer()
    }
  }
}

main().catch((err) => {
  console.error(err)
  stopDemoServer()
  process.exit(1)
})
