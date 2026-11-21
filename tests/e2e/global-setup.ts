import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { E2E_PORT, OL_STUB_PORT } from "../../playwright.config";
import { startOpenLibraryStub } from "./openlibrary-stub";
import { createAdmin, E2E_DB_URL } from "./seed";

async function waitFor(url: string, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`dev server did not start at ${url}`);
}

export default async function globalSetup() {
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    rmSync(`test-e2e.db${suffix}`, { force: true });
  }
  const client = createClient({ url: E2E_DB_URL });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await createAdmin(
    drizzle(client, { schema: await import("../../src/lib/server/db/schema") }),
  );
  client.close();

  const stub = await startOpenLibraryStub(OL_STUB_PORT);
  // Started here (not via webServer) so the database is migrated and seeded before the app opens it.
  const dev: ChildProcess = spawn(
    "npx",
    ["vite", "dev", "--port", String(E2E_PORT), "--strictPort"],
    {
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        TURSO_DATABASE_URL: E2E_DB_URL,
        OPENLIBRARY_BASE_URL: `http://localhost:${OL_STUB_PORT}`,
      },
    },
  );
  await waitFor(`http://localhost:${E2E_PORT}/robots.txt`);

  return async () => {
    if (dev.pid) process.kill(-dev.pid);
    stub.close();
  };
}
