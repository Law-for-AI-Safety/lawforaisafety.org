import { Browser, Page } from 'playwright'
import { DemoEngine } from '../engine'
import { buildTitleCardHtml } from '../html'
import { demoAdminCookie } from '../auth'
import { BASE_URL } from '../data'

export const meta = {
  name: 'reschedule-dependents',
  title: 'When a task’s dates change',
} as const

// From demo/seed.ts: the review is overdue and in progress, and publishing
// is waiting on it, due to start in 3 days.
const PROJECT = 'Volunteer intake & vetting policy'
const REVIEW = 'Legal review of vetting criteria'

const PROJECT_URL = /\/admin\/task-tracker\/projects\/[0-9a-f-]{36}$/
const TASK_URL = /\/admin\/task-tracker\/tasks\/[0-9a-f-]{36}$/

function dateField(page: Page, label: string) {
  return page
    .locator('div')
    .filter({ has: page.getByLabel(label, { exact: true }) })
    .last()
}

function reschedulePanel(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text })
}

export async function run(engine: DemoEngine, browser: Browser): Promise<void> {
  console.log('  Recording reschedule walkthrough...')
  const cookies = engine.isDetecting ? [] : [await demoAdminCookie()]
  const { ctx, page } = await engine.beginSegment(browser, { cookies })
  // The reschedule offer sits in the sticky save bar at the bottom.
  engine.captionPosition = 'top'

  await engine.showTitleCard(
    `${BASE_URL}/admin/task-tracker/projects`,
    buildTitleCardHtml(meta.title),
  )
  await engine.narrate(
    'Plans slip. Here’s what the Project Tracker does when a task that others are waiting on changes its dates.',
  )
  await engine.dismissTitleCard(600)
  await engine.placeCursor(640, 300)

  await engine.narrate('In this project, publishing the policy has to wait for the legal review.', async () => {
    await engine.click(page.getByRole('link', { name: new RegExp(PROJECT) }), {
      navigatesTo: PROJECT_URL,
    })
    await engine.pause(400)
    await engine.click(page.getByRole('link', { name: new RegExp(REVIEW) }).last(), {
      navigatesTo: TASK_URL,
    })
    await engine.pause(300)
    await engine.readText(page.getByText(/^Waiting on this task/), 220)
  })

  // Slip: the review now ends after publishing was due to start
  await engine.narrate(
    'The review has slipped, and will now take another two weeks.',
    async () => {
      await engine.click(dateField(page, 'Planned end').getByRole('button', { name: '+2 weeks' }))
      await engine.pause(300)
      await engine.readText(dateField(page, 'Planned end').locator('p').first(), 200)
      await engine.pause(200)
      await engine.click(page.getByRole('button', { name: 'Save changes' }))
      await reschedulePanel(page, 'ends later').waitFor()
    },
  )

  const later = reschedulePanel(page, 'ends later')
  await engine.narrate(
    'Publishing was due to start before the review finishes, so the tracker offers to move it back, keeping the same length.',
    async () => {
      await engine.readText(later.locator('li').first(), 200)
    },
  )

  await engine.narrate(
    'Nothing moves until you say so. Choose Move it later to accept.',
    async () => {
      await engine.click(later.getByRole('button', { name: 'Move it later' }))
      await engine.readText(page.getByText(/Rescheduled 1 task/), 220)
    },
  )

  // Early finish: the review now ends sooner
  await engine.narrate(
    'Good news works the same way. If the review will finish a week sooner…',
    async () => {
      await engine.click(dateField(page, 'Planned end').getByRole('button', { name: '+1 week' }))
      await engine.pause(300)
      await engine.click(page.getByRole('button', { name: 'Save changes' }))
      await reschedulePanel(page, 'ends earlier').waitFor()
    },
  )

  const earlier = reschedulePanel(page, 'ends earlier')
  await engine.narrate(
    '…you’re asked whether to bring publishing forward too. Leave as is keeps its dates.',
    async () => {
      await engine.readText(earlier.locator('li').first(), 200)
      await engine.pause(300)
      await engine.click(earlier.getByRole('button', { name: 'Move it earlier' }))
      await page.getByText(/Rescheduled 1 task/).waitFor()
    },
  )

  await engine.narrate(
    'Back on the project, the timeline shows the two tasks lined up again.',
    async () => {
      await engine.click(page.getByRole('link', { name: `← ${PROJECT}` }), {
        navigatesTo: PROJECT_URL,
      })
      await engine.pause(400)
      await engine.readText(page.getByRole('heading', { name: 'Timeline' }), 200)
      await engine.readText(page.getByText(/ · Draft$/).last(), 200)
    },
  )

  await engine.pause(1500)
  await engine.endSegment(ctx)
}
