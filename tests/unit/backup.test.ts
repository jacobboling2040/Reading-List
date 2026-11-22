import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../src/lib/server/db/test-db";
import { books, users } from "../../src/lib/server/db/schema";
import { createSession } from "../../src/lib/server/auth/session";
import {
  createInvite,
  createUser,
  listAllPendingInvites,
  revokeInvite,
} from "../../src/lib/server/users";
import { dumpDatabase } from "../../src/lib/server/backup";

async function tableCounts(client: {
  execute: (s: string) => Promise<{ rows: unknown[] }>;
}) {
  const t = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
  );
  const out: Record<string, number> = {};
  for (const r of t.rows as unknown as { name: string }[]) {
    const c = await client.execute(`SELECT count(*) AS n FROM "${r.name}"`);
    out[r.name] = Number((c.rows[0] as unknown as { n: number }).n);
  }
  return out;
}

async function seeded() {
  const db = await createTestDb();
  const a = await createUser(db, {
    username: "alice",
    displayName: "Al'ice",
    password: "password-12345",
  });
  const b = await createUser(db, {
    username: "bob",
    displayName: "Bob",
    password: "password-12345",
  });
  await createInvite(db, a);
  await createSession(db, a);
  return { db, a, b };
}

describe("dumpDatabase", () => {
  it("dump restores into a fresh in-memory db with identical row counts", async () => {
    const { db, a } = await seeded();
    await db.insert(books).values({
      title: "T",
      authors: '["A"]',
      createdBy: a,
    });
    const sql = await dumpDatabase(db);
    const fresh = createClient({ url: ":memory:" });
    await fresh.executeMultiple(sql);
    const orig = await tableCounts(db.$client);
    const restored = await tableCounts(fresh);
    expect(Object.keys(restored)).toEqual(Object.keys(orig));
    expect(restored.users).toBe(2);
    expect(restored.invites).toBe(1);
    expect(restored.books).toBe(1);
    expect(restored.sessions).toBe(0);
    for (const k of Object.keys(orig)) {
      if (k !== "sessions" && k !== "login_attempts")
        expect(restored[k]).toBe(orig[k]);
    }
    const idx = await fresh.execute(
      "SELECT name FROM sqlite_master WHERE name='users_username_lower_unique'",
    );
    expect(idx.rows).toHaveLength(1);
  });

  it("dump contains no session rows", async () => {
    const { db } = await seeded();
    const before = await db.$client.execute(
      "SELECT count(*) AS n FROM sessions",
    );
    expect(Number(before.rows[0].n)).toBe(1);
    const sql = await dumpDatabase(db);
    expect(sql).toContain("CREATE TABLE `sessions`");
    expect(sql).not.toMatch(/INSERT INTO [`"]?sessions/);
    expect(sql).not.toMatch(/INSERT INTO [`"]?login_attempts/);
    expect(sql).not.toContain("__drizzle");
    expect(sql.startsWith("PRAGMA foreign_keys=OFF;")).toBe(true);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("values with quotes round-trip", async () => {
    const { db, a } = await seeded();
    await db
      .update(users)
      .set({ displayName: "O'Brien; DROP TABLE users; --\n'' \"x\"" })
      .where(eq(users.id, a));
    const sql = await dumpDatabase(db);
    const fresh = createClient({ url: ":memory:" });
    await fresh.executeMultiple(sql);
    const r = await fresh.execute(
      "SELECT display_name, deactivated_at FROM users ORDER BY id",
    );
    expect(r.rows[0].display_name).toBe(
      "O'Brien; DROP TABLE users; --\n'' \"x\"",
    );
    expect(r.rows[0].deactivated_at).toBeNull();
    expect(r.rows).toHaveLength(2);
  });

  it("round-trips blobs and reals", async () => {
    const db = await createTestDb();
    await db.$client.execute(
      "CREATE TABLE extra (a BLOB, b REAL, c INTEGER, d TEXT)",
    );
    await db.$client.execute({
      sql: "INSERT INTO extra VALUES (?, ?, ?, ?)",
      args: [new Uint8Array([0, 255, 16]).buffer, 1.5, 7, null],
    });
    const fresh = createClient({ url: ":memory:" });
    await fresh.executeMultiple(await dumpDatabase(db));
    const r = await fresh.execute("SELECT hex(a) AS h, b, c, d FROM extra");
    expect(r.rows[0].h).toBe("00FF10");
    expect(r.rows[0].b).toBe(1.5);
    expect(r.rows[0].c).toBe(7);
    expect(r.rows[0].d).toBeNull();
  });
});

describe("listAllPendingInvites", () => {
  it("lists unused, unrevoked, unexpired invites from all creators", async () => {
    const { db, a, b } = await seeded();
    const tb = await createInvite(db, b);
    await createInvite(db, a, Date.now() - 8 * 24 * 60 * 60 * 1000);
    const t3 = await createInvite(db, b);
    await revokeInvite(db, t3, b);
    const list = await listAllPendingInvites(db);
    expect(list.map((i) => i.createdBy).sort()).toEqual([a, b]);
    expect(list.some((i) => i.token === tb)).toBe(true);
    expect(list.every((i) => typeof i.createdByName === "string")).toBe(true);
  });
});
