# Google Search Console setup

Do this once to get lawforaisafety.org indexed and tracked in Google.

## 1. Add the property

1. Go to <https://search.google.com/search-console>
2. Click **Add property** → choose **URL prefix** (not Domain) → enter `https://lawforaisafety.org`
3. Verify ownership. Easiest method here: **HTML tag**. Google gives you a `<meta name="google-site-verification" content="...">` tag.
   - Add that `content` value to `src/app/layout.tsx` metadata:

     ```ts
     export const metadata: Metadata = {
       // ...existing fields
       verification: {
         google: "PASTE_VALUE_HERE",
       },
     };
     ```

   - Deploy, then click **Verify** in Search Console.
4. Alternative verification: add a TXT record at your DNS provider (works if you verify at the domain level instead of URL-prefix — covers all subdomains too). Either method is fine; HTML tag is simplest given we already control the codebase.

## 2. Submit the sitemap

Once `src/app/sitemap.ts` is deployed, it's served at `https://lawforaisafety.org/sitemap.xml`.

1. In Search Console, left sidebar → **Sitemaps**
2. Enter `sitemap.xml` → **Submit**

## 3. Request indexing

1. Left sidebar → **URL Inspection**
2. Enter `https://lawforaisafety.org`
3. Click **Request indexing** — speeds up first crawl instead of waiting for Google to find it naturally.

## 4. Ongoing

- Check **Coverage/Pages** report after a few days to confirm the homepage is indexed, no errors.
- Check **Performance** report after ~1-2 weeks for impressions/clicks/query data.
- Re-submit the sitemap whenever new indexable pages are added.

---

# Bing Webmaster Tools setup

Covers Bing directly, plus feeds DuckDuckGo and Yahoo (both use Bing's index).

## 1. Add the property

1. Go to <https://www.bing.com/webmasters>
2. Sign in with a Microsoft account.
3. Easiest path: **Import from Google Search Console** — one click, pulls in the verified property and sitemap from the GSC setup above, no code changes needed. Pick this if GSC is already verified.
4. Manual alternative (if not importing): **Add a site** → enter `https://lawforaisafety.org` → verify via one of:
   - **XML file** — upload a `BingSiteAuth.xml` file to `public/`, or
   - **Meta tag** — Bing gives you `<meta name="msvalidate.01" content="...">`. Add the `content` value to `src/app/layout.tsx`:

     ```ts
     export const metadata: Metadata = {
       // ...existing fields
       verification: {
         google: "...",
         other: {
           "msvalidate.01": "PASTE_VALUE_HERE",
         },
       },
     };
     ```

   - **DNS CNAME** — add a record at your DNS provider (covers the whole domain).

## 2. Submit the sitemap

1. In Bing Webmaster Tools, left sidebar → **Sitemaps**
2. Enter `https://lawforaisafety.org/sitemap.xml` → **Submit**

(Skipped automatically if you imported from GSC — it carries the sitemap over.)

## 3. Request indexing

1. Left sidebar → **URL Inspection** (or **Submit URLs**)
2. Enter `https://lawforaisafety.org` → submit
3. Bing also has a **URL Submission API quota** (daily limit) if you add more pages later — not needed for a single homepage.

## 4. Ongoing

- Check **Site Explorer** / **Reports & Data** after a few days for crawl/index status.
- Re-submit the sitemap whenever new indexable pages are added.
