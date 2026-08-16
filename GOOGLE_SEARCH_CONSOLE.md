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
