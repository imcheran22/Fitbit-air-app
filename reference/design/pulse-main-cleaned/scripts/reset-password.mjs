// Forgot password, without an email server: sets a temporary password for an account and signs it out everywhere.
//   docker exec pulse node scripts/reset-password.mjs <email-or-username>
// Prints the temporary password; the user signs in with it and changes it in Settings › Account.
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

const who = process.argv[2]?.trim();
if (!who) {
  console.error("Usage: node scripts/reset-password.mjs <email-or-username>");
  process.exit(2);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://pulse:pulse@localhost:5432/pulse" });
await db.connect();
try {
  const { rows } = await db.query(`select id, email from "user" where lower(email) = lower($1) or username = lower($1)`, [who]);
  if (rows.length !== 1) {
    console.error(`No account with the email or username "${who}".`);
    process.exitCode = 1;
  } else {
    const { id, email } = rows[0];
    const temp = randomBytes(12).toString("base64url"); // 16 characters
    const hash = await hashPassword(temp);
    await db.query("begin");
    const updated = await db.query(`update account set password = $1, updated_at = now() where user_id = $2 and provider_id = 'credential'`, [hash, id]);
    if (updated.rowCount === 0) {
      await db.query(`insert into account (account_id, provider_id, user_id, password, updated_at) values ($1, 'credential', $2, $3, now())`, [String(id), id, hash]);
    }
    await db.query(`delete from session where user_id = $1`, [id]);
    await db.query("commit");
    console.log(`Temporary password for ${email}: ${temp}`);
    console.log("Every session of this account is signed out. Sign in with it, then change it in Settings › Account.");
  }
} finally {
  await db.end();
}
