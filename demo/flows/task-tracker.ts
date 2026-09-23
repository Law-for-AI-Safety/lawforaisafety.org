import { Browser, Page } from 'playwright'
import { DemoEngine } from '../engine'
import { buildTitleCardHtml } from '../html'
import { demoAdminCookie } from '../auth'
import { BASE_URL } from '../data'

export const meta = {
  name: 'task-tracker',
  title: 'Planning work with the Project Tracker',
} as const

const NEW_PROJECT = {
  name: 'EU AI Act consultation response',
  description: "Coordinate the team's written response to the Commission's consultation.",
}
const DRAFT_TASK = {
  name: 'Draft consultation response',
  description: 'First full draft, working from the consultation questions.',
}
const SIGNOFF_TASK = {
  name: 'Legal sign-off on the response',
  blockedReason: 'Waiting for the Commission to publish the final question list.',
}

const PROJECT_URL = /\/admin\/task-tracker\/projects\/[0-9a-f-]{36}$/
const NEW_TASK_URL = /\/admin\/task-tracker\/projects\/[0-9a-f-]{36}\/tasks\/new$/
const TASK_URL = /\/admin\/task-tracker\/tasks\/[0-9a-f-]{36}$/

export async function run(engine: DemoEngine, browser: Browser): Promise<void> {
  const cookies = engine.isDetecting ? [] : [await demoAdminCookie()]
  await recordOverview(engine, browser, cookies)
  await recordPlanning(engine, browser, cookies)
}

/** A date field's own container, so its preset buttons ("Today", "+1 week") can't be confused with another field's. */
function dateField(page: Page, label: string) {
  return page
    .locator('div')
    .filter({ has: page.getByLabel(label, { exact: true }) })
    .last()
}

// ─── Segment 1: finding your way around ──────────────────────────────────────

async function recordOverview(
  engine: DemoEngine,
  browser: Browser,
  cookies: Awaited<ReturnType<typeof demoAdminCookie>>[],
): Promise<void> {
  console.log('  Recording overview...')
  const { ctx, page } = await engine.beginSegment(browser, { cookies })

  await engine.showTitleCard(`${BASE_URL}/admin/task-tracker`, buildTitleCardHtml(meta.title))
  await engine.narrate(
    "This is the Project Tracker, where the legal team plans its work and keeps track of who's doing what.",
  )
  await engine.dismissTitleCard(600)
  await engine.placeCursor(640, 300)

  await engine.narrate(
    'When you open it, you land on Your work: every task assigned to you, grouped by what needs attention first.',
    async () => {
      await engine.readText(page.getByRole('heading', { level: 1 }), 260)
    },
  )

  await engine.narrate('Anything overdue comes first, so it can’t get lost.', async () => {
    await engine.readText(page.getByRole('heading', { name: /^Overdue/ }), 220)
  })

  await engine.narrate(
    'Then anything blocked, with the reason it’s stuck, and after that, whatever is due in the next week.',
    async () => {
      await engine.readText(page.getByRole('heading', { name: /^Blocked/ }), 220)
      await engine.pause(400)
      await engine.readText(page.getByRole('heading', { name: /^Due in the next week/ }), 220)
    },
  )

  await engine.narrate('Further down are the projects you own, or have a task in.', async () => {
    await engine.readText(page.getByRole('heading', { name: 'Your projects' }), 220)
  })

  await engine.narrate(
    'All projects shows everything the team is working on, with progress and due dates at a glance.',
    async () => {
      await engine.click(page.locator('header').getByRole('link', { name: 'All projects' }), {
        navigatesTo: `${BASE_URL}/admin/task-tracker/projects`,
      })
      await engine.pause(600)
      await engine.readText(page.getByText(/\d+\/\d+ tasks done/).first(), 200)
    },
  )

  await engine.pause(600)
  await engine.endSegment(ctx)
}

// ─── Segment 2: a new project, its tasks, and how they depend on each other ──

async function recordPlanning(
  engine: DemoEngine,
  browser: Browser,
  cookies: Awaited<ReturnType<typeof demoAdminCookie>>[],
): Promise<void> {
  console.log('  Recording planning walkthrough...')
  const { ctx, page } = await engine.beginSegment(browser, { cookies })

  await engine.navigateTo(`${BASE_URL}/admin/task-tracker/projects`)
  await engine.placeCursor(640, 300)

  // Create the project
  await engine.narrate("Let's set up a new project.", async () => {
    await engine.click(page.getByRole('link', { name: 'New project' }), {
      navigatesTo: `${BASE_URL}/admin/task-tracker/projects/new`,
    })
  })

  await engine.narrate(
    'Give it a name, and a line on what finished looks like.',
    async () => {
      await engine.type(page.getByLabel('Name', { exact: true }), NEW_PROJECT.name, 40)
      await engine.pause(200)
      await engine.type(page.getByLabel('Description'), NEW_PROJECT.description, 22)
    },
  )

  await engine.narrate('Every project has an owner. Here, that’s me.', async () => {
    await engine.click(page.getByRole('button', { name: 'Assign to me' }))
  })

  await engine.narrate(
    'Shortcuts fill in the dates people usually pick, and the date is written out underneath so it’s easy to check.',
    async () => {
      await engine.click(dateField(page, 'Planned start').getByRole('button', { name: 'Today' }))
      await engine.pause(300)
      await engine.click(
        dateField(page, 'Planned end').getByRole('button', { name: '+2 weeks' }),
      )
      await engine.pause(300)
      await engine.readText(dateField(page, 'Planned end').locator('p').first(), 200)
    },
  )

  await engine.click(page.getByRole('button', { name: 'Create project' }), {
    navigatesTo: PROJECT_URL,
  })
  await engine.pause(500)

  await engine.narrate(
    'A new project starts empty, with a prompt to break the work into tasks.',
    async () => {
      await engine.readText(page.getByText('This project has no tasks yet.'), 220)
    },
  )

  // First task: picked by name
  await engine.click(page.getByRole('link', { name: 'Add the first task' }), {
    navigatesTo: NEW_TASK_URL,
  })

  await engine.narrate('The first task is the draft.', async () => {
    await engine.type(page.getByLabel('Name', { exact: true }), DRAFT_TASK.name, 40)
    await engine.pause(200)
    await engine.type(page.getByLabel('Description'), DRAFT_TASK.description, 22)
  })

  await engine.narrate(
    'To assign it, start typing a name and pick the person from the list.',
    async () => {
      await engine.type(page.getByRole('combobox', { name: 'Assignee' }), 'Ali', 120)
      await engine.pause(400)
      await engine.click(page.getByRole('option', { name: /Alice/ }))
    },
  )

  await engine.narrate('It starts today, and it’s due in a week.', async () => {
    await engine.click(dateField(page, 'Planned start').getByRole('button', { name: 'Today' }))
    await engine.pause(300)
    await engine.click(dateField(page, 'Planned end').getByRole('button', { name: '+1 week' }))
  })

  await engine.click(page.getByRole('button', { name: 'Create task' }), { navigatesTo: TASK_URL })
  await engine.pause(500)

  await engine.narrate(
    'Saving opens the task, where you can add links, notes and more detail at any time.',
    async () => {
      await engine.readText(page.getByRole('heading', { level: 1 }), 220)
    },
  )

  // Second task: depends on the first
  await engine.click(page.getByRole('link', { name: `← ${NEW_PROJECT.name}` }), {
    navigatesTo: PROJECT_URL,
  })
  await engine.click(page.getByRole('link', { name: 'New task' }), { navigatesTo: NEW_TASK_URL })

  await engine.narrate('Next, a legal sign-off, which I’ll take myself.', async () => {
    await engine.type(page.getByLabel('Name', { exact: true }), SIGNOFF_TASK.name, 40)
    await engine.pause(200)
    await engine.click(page.getByRole('button', { name: 'Assign to me' }))
  })

  await engine.narrate(
    'Sign-off can’t start until the draft is done, so we add the draft under Blocked by.',
    async () => {
      await engine.type(
        page.getByRole('combobox', { name: 'Add a task it depends on' }),
        'Draft',
        120,
      )
      await engine.pause(400)
      await engine.click(page.getByRole('option', { name: new RegExp(DRAFT_TASK.name) }))
    },
  )

  await engine.narrate(
    'The tracker then suggests starting the day after the draft is due to end.',
    async () => {
      await engine.click(page.getByRole('button', { name: /the day after .* ends$/ }))
      await engine.pause(300)
      await engine.click(
        dateField(page, 'Planned end').getByRole('button', { name: '+2 weeks' }),
      )
    },
  )

  await engine.click(page.getByRole('button', { name: 'Create task' }), { navigatesTo: TASK_URL })
  await engine.pause(500)

  await engine.narrate(
    'The task page shows exactly what it’s waiting on.',
    async () => {
      await engine.readText(page.getByText(/^Waiting on this task to be Done/), 220)
    },
  )

  // The project page: timeline and dependency flag
  await engine.click(page.getByRole('link', { name: `← ${NEW_PROJECT.name}` }), {
    navigatesTo: PROJECT_URL,
  })
  await engine.pause(400)

  await engine.narrate(
    'Back on the project, the timeline shows how the work lines up, and the sign-off is flagged as waiting on another task.',
    async () => {
      await engine.scrollPage(500, 2500)
      await engine.pause(300)
      await engine.readText(page.getByText('Waiting on dependency').first(), 200)
    },
  )

  // Status: saves on the spot
  await engine.click(page.getByRole('link', { name: new RegExp(DRAFT_TASK.name) }).last(), {
    navigatesTo: TASK_URL,
  })
  await engine.pause(400)

  const status = page.getByRole('combobox', { name: /^Status/ })
  await engine.narrate(
    'When work starts, change the status. It saves straight away, with no need to press save.',
    async () => {
      await engine.select(status, 'In progress')
      await engine.readText(page.getByText('Status saved.'), 200)
    },
  )

  await engine.narrate('And when the draft is finished, mark it Done.', async () => {
    await engine.select(status, 'Done')
    await page.getByText('Status saved.').waitFor()
  })

  await engine.narrate(
    'Finishing it clears the way for the sign-off, and the tracker says so.',
    async () => {
      await engine.readText(page.getByText('Finishing this unblocked:'), 200)
    },
  )

  // Blocked needs a reason
  await engine.click(page.getByRole('link', { name: SIGNOFF_TASK.name }), {
    navigatesTo: TASK_URL,
  })
  await engine.pause(400)

  await engine.narrate(
    'If something outside the team holds a task up, mark it Blocked. The tracker asks what’s blocking it, so nobody has to chase for the reason.',
    async () => {
      await engine.select(status, 'Blocked')
      await engine.type(page.getByLabel(/What.s blocking this/), SIGNOFF_TASK.blockedReason, 25)
      await engine.pause(200)
      await engine.click(page.getByRole('button', { name: 'Mark blocked' }))
      await page.getByText(`Blocked: ${SIGNOFF_TASK.blockedReason}`).waitFor()
    },
  )

  // Back to the front page
  await engine.narrate(
    'And because the sign-off is mine, it’s now on my Your work page, under Blocked.',
    async () => {
      await engine.click(page.locator('header').getByRole('link', { name: 'Your work' }), {
        navigatesTo: `${BASE_URL}/admin/task-tracker`,
      })
      await engine.pause(400)
      await engine.readText(page.getByRole('link', { name: new RegExp(SIGNOFF_TASK.name) }), 220)
    },
  )

  await engine.narrate(
    'That’s the Project Tracker: plan the work, see what’s waiting on what, and always know what to pick up next.',
  )

  await engine.pause(600)
  await engine.endSegment(ctx)
}
