import fs from 'fs'
import path from 'path'

const LOGOMARK = path.join(
  __dirname,
  '..',
  'design',
  'Logomark',
  'Warm White',
  'LFAS Logomark White.svg',
)

/** Full-screen opening card in the site's colours: logomark, org name, video title. */
export function buildTitleCardHtml(videoTitle: string): string {
  const logo = fs.readFileSync(LOGOMARK, 'utf8').replace(/<\?xml[^>]*\?>/, '')
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&display=block" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Cormorant Garamond',Georgia,serif;background:#1b334c;color:#f3f0ec;height:100vh;display:flex;align-items:center;justify-content:center}
    .card{display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center}
    .logo svg{width:120px;height:auto;display:block}
    .org{font-size:64px;letter-spacing:0.5px}
    .title{font-size:36px;opacity:0.85}
  </style></head><body>
  <div class="card">
    <div class="logo">${logo}</div>
    <div class="org">Law for AI Safety</div>
    <div class="title">${videoTitle}</div>
  </div>
  </body></html>`
}
