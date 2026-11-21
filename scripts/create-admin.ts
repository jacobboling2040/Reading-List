import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/server/db/client";
import { users } from "../src/lib/server/db/schema";
import { createUser, validateSignup } from "../src/lib/server/users";
import { UserError } from "../src/lib/server/errors";

const [username, ...rest] = process.argv.slice(2);
const displayName = rest.join(" ");
if (!username || !displayName) {
  console.error(
    "Usage: npx tsx scripts/create-admin.ts <username> <display name>",
  );
  process.exit(1);
}

const db = getDb();
const [existing] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.isAdmin, true));
if (existing) {
  console.error("An admin already exists; refusing to create another.");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("Password (min 10 characters): ");
rl.close();

const problem = validateSignup({ username, displayName, password });
if (problem) {
  console.error(problem);
  process.exit(1);
}
try {
  const id = await createUser(db, {
    username,
    displayName,
    password,
    isAdmin: true,
  });
  console.log(`Created admin "${username}" (id ${id}).`);
  process.exit(0);
} catch (e) {
  console.error(e instanceof UserError ? e.message : e);
  process.exit(1);
}
