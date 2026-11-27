# Tuning the News radar

The News radar (`/admin/news-radar`) searches news and journal sources every Monday, keeps what matches its topics, and emails the team a summary. The team marks each item Useful or Dismissed. This guide is for an agent, run by an admin, that judges how relevant the radar's items are to Law for AI Safety's mission and proposes changes to the topics and keywords. Every change goes to Harry for approval before it is saved.

## The tools

`npm run -s news-radar -- <command>` calls the News radar API with `NEWS_RADAR_API_KEY` from the environment or `.env.local`, and never prints the key, so never read the key yourself. It talks to the live site unless `NEWS_RADAR_API_URL` names another (for example `http://localhost:3001`). `-s` keeps npm's own lines out of the output, so it can go straight to a file.

```
npm run -s news-radar -- export --since 2026-09-01 > items.json     # stored items, newest first
npm run -s news-radar -- settings get > settings.json               # topics and trusted outlets
npm run -s news-radar -- rescore proposed.json --since 2026-09-01   # dry run: saves nothing
npm run -s news-radar -- settings put proposed.json                 # saves; only after Harry approves
```

`--since` (a day, `YYYY-MM-DD`) defaults to the last 90 days; a response covers at most 2000 items and says `"truncated": true` when there were more, so then ask for a shorter stretch. The endpoints behind these are `GET /api/admin/news-radar/items?since=`, `GET` and `PUT /api/admin/news-radar/settings` and `POST /api/admin/news-radar/rescore`, each taking `Authorization: Bearer <NEWS_RADAR_API_KEY>` or an admin's session. A save made with the key is recorded in the audit log as `news-radar@api`.

### What an exported item holds

- `title`, `outlet`, `url`, `snippet` (the summary the source gave), `kind` (`news` or `paper`), `publishedAt`, `firstSeenAt`, `sources` (which services found it).
- `state`: `new` (nobody has looked yet), `useful` or `dismissed`; `triagedAt` is when the team decided.
- `topics` and `score`: as stored when the radar found it, under the settings of the time.
- `matched`: the topics it matches under the current settings, each with the include keywords found in it. The same line, "Matched: ...", is on each item in the admin page.

### The settings

`settings get` returns `topics` and `trustedOutlets`. Each topic has:

- `id`: keep it when editing a topic, so stored items keep their topic. Leave it out for a new topic and one is made from its name.
- `name`: what the team sees.
- `queries`: the searches sent to Google News and OpenAlex, ORed together as written, so put a phrase in double quotes (`"AI Act" fine`).
- `include`: an item matches the topic only if its title or summary holds one of these, as whole words, ignoring case, accents and punctuation. Each one found scores a point, two in the title. GDELT is searched for the multi-word include keywords rather than the queries, and the Commission's digital policy feed is read whole, so `include` also decides what those two sources bring in.
- `require`: when not empty, an item must also hold one of these (the shared list of AI words, say).
- `exclude`: an item holding any of these never matches the topic.

A trusted outlet (a name, or a domain such as `europa.eu`) adds 3 to an item's score. The radar keeps an item when it matches at least one topic; the score only orders the summary. Limits: 20 topics, 40 entries per list, 120 characters per entry, 100 trusted outlets. Where the weekly email goes is not part of these settings and cannot be changed through the API.

## 1. Read the mission

Judge relevance against what the organisation says it does, not against the radar's current topics. Read, in `content/`:

- `home.json`: the mission and the "what we do" sections (field building, transparency through Freedom of Information requests, dialogue with EU institutions and the Council of Europe, large-scale AI risks).
- The project pages: `field-building.json`, `freedom-of-information.json`, `council-of-europe.json`, `mep-outreach.json`, `red-lines-dialogue.json`.

Use only what these say about the work. Leave out the team section and anything about people: a tuning proposal never needs to name anyone.

## 2. Rate each item

Rate every exported item on this scale, with one line of reason:

- **3, core**: directly about enforcing or applying law to AI, liability, litigation or remedies for AI harms, or governance of large-scale AI risks, in the EU or with a clear bearing on it. The team would likely act on it or share it.
- **2, related**: about AI law or policy but at one remove: a general AI policy debate, a ruling elsewhere with some read-across, a consultation.
- **1, marginal**: mentions AI and a legal word in passing; the law is not the story.
- **0, off-topic**: a keyword matched by accident (a company named after a word, an unrelated "class action", a job advert, a webinar).

Rate from the title, outlet and snippet; do not open the links unless a rating truly turns on it.

## 3. Take the team's decisions as ground truth

Where the team has triaged an item, its decision wins over your rating: `useful` items are relevant and `dismissed` items are not. Use them to calibrate your scale (if the team dismisses items you rated 2, raise your bar), and note where you disagree, but never argue a change on the strength of overruling the team. Your ratings matter most for `new` items, which nobody has judged.

## 4. Propose changes and check them with rescore

Look for patterns first: keywords that match mostly Dismissed or 0-rated items, exclude words that would remove those without touching Useful ones, topics whose items are nearly all off-topic, and Useful or 3-rated items that only match by luck. Typical changes:

- add an `exclude` word that recurs in Dismissed items (a word for the off-topic sense);
- make an `include` keyword more specific, or move a too-general one to `require`;
- add an `include` keyword that Useful items share;
- change `queries` to search for what the Useful items are about (rescore cannot judge this: see below);
- add or remove a trusted outlet.

Write the proposal as a full settings file (start from `settings get` and edit it) and run `rescore` on it, over a stretch long enough to hold plenty of triaged items. It answers, without saving anything, how every stored item scores now and would score: `summary` tallies kept items by state (`total`, `keptNow`, `keptProposed`), and each item has `change` (`still kept`, `still dropped`, `newly kept`, `newly dropped`) and the proposed `matched` keywords. Judge it on:

- **Recall on Useful**: `useful.keptProposed` should equal `useful.total`. Any Useful item newly dropped is a strong reason against the change; list each one.
- **Precision on Dismissed**: `dismissed.keptProposed` should fall. The share of Dismissed items dropped is the change's main benefit.
- **Your ratings on new items**: items you rated 2 or 3 should stay kept, and the 0s should go.

Iterate until the change drops no Useful item, or the case for dropping one is clear and stated.

Rescore only re-judges items the radar already stored. It cannot say what new search terms would find, nor bring back items the radar never kept, so a change to `queries`, or to `include` keywords meant to catch more, is only tested by the next run: say so in the proposal.

## 5. Send Harry a short summary before saving

Never run `settings put` until Harry has approved the exact file. Send him:

- **What changes**: each topic touched, with keywords added or removed, before and after.
- **Why**: the pattern behind it, with two or three example titles.
- **Rescore, before and after**: Useful kept, Dismissed kept and your 2-3 rated new items kept, now and proposed, over which dates.
- **Useful items lost**, if any, by title, and why the change is still worth it.
- **Not testable by rescore**: any change to `queries` or a widening of `include`.

Keep it to what he needs to decide: no members, no personal data, no full item lists. Once he approves, `settings put` the approved file and check it with `settings get`.
