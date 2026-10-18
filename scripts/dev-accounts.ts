// Lets the made-up dev accounts (src/lib/dev-accounts.ts) into the local dev server: adds
// them to ADMIN_EMAILS and TECH_ADMIN_EMAILS in .env.local and gives them their CMS roles in
// the local database. Refuses any database not on this machine.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { DEV_ACCOUNTS, isLocalDatabase, withDevAccounts } from "../src/lib/dev-accounts";

const ENV_FILE = ".env.local";

async function main() {
  const before = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const url = process.env.DATABASE_URL ?? before.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^"(.*)"$/, "$1");
  if (!url) {
    console.error(`DATABASE_URL is not set, in the environment or ${ENV_FILE}.`);
    process.exit(1);
  }
  if (!isLocalDatabase(url)) {
    console.error("DATABASE_URL is not a database on this machine; the dev accounts are only for a local one.");
    process.exit(1);
  }

  const after = withDevAccounts(before);
  if (after !== before) writeFileSync(ENV_FILE, after);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const account of DEV_ACCOUNTS) {
      await client.query(
        `insert into admin_people (email, name) values ($1, $2)
         on conflict (email) do update set name = excluded.name`,
        [account.email, account.name],
      );
      if (account.cms) {
        await client.query(
          `insert into cms_roles (email, permission, granted_by) values ($1, $2, 'npm run dev:accounts')
           on conflict (email) do update set permission = excluded.permission`,
          [account.email, account.cms],
        );
      } else {
        await client.query("delete from cms_roles where email = $1", [account.email]);
      }
    }
  } finally {
    await client.end();
  }

  const port = process.env.PORT ?? "3001";
  console.log(after !== before ? `Added the dev accounts to ${ENV_FILE}; restart the dev server to pick them up.\n` : "");
  console.log("Sign in by opening, on the dev server:");
  for (const account of DEV_ACCOUNTS) {
    console.log(`  http://${account.key}.localhost:${port}/api/admin/dev-login  ${account.name}, ${account.access}`);
  }
}

void main();
