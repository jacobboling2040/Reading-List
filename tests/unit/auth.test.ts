import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../src/lib/server/db/test-db";
import * as s from "../../src/lib/server/db/schema";
import {
  hashPassword,
  verifyPassword,
} from "../../src/lib/server/auth/password";
import {
  createSession,
  validateSession,
} from "../../src/lib/server/auth/session";
import {
  checkLoginAllowed,
  recordFailedLogin,
} from "../../src/lib/server/auth/rate-limit";
import { isPublicPath } from "../../src/lib/server/auth/guard";

const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const db = await createTestDb();
  const [user] = await db
    .insert(s.users)
    .values({
      username: "sam",
      displayName: "Sam",
      passwordHash: "x",
      createdAt: 1,
    })
    .returning();
  return { db, user };
}

describe("password", () => {
  it("hash then verify", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toContain("argon2id");
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong password")).toBe(false);
  });
});

describe("sessions", () => {
  it("validateSession returns user for fresh token", async () => {
    const { db, user } = await setup();
    const { token } = await createSession(db, user.id);
    const res = await validateSession(db, token);
    expect(res?.user).toEqual({
      id: user.id,
      username: "sam",
      displayName: "Sam",
      isAdmin: false,
    });
    const rows = await db.select().from(s.sessions);
    expect(rows[0].idHash).not.toBe(token);
  });

  it("validateSession returns null after expiry", async () => {
    const { db, user } = await setup();
    const { token } = await createSession(db, user.id, 1_000);
    expect(await validateSession(db, token, 1_000 + 30 * DAY + 1)).toBeNull();
    expect(await db.select().from(s.sessions)).toHaveLength(0);
  });

  it("validateSession returns null once user is deactivated", async () => {
    const { db, user } = await setup();
    const { token } = await createSession(db, user.id);
    await db
      .update(s.users)
      .set({ deactivatedAt: 5 })
      .where(eq(s.users.id, user.id));
    expect(await validateSession(db, token)).toBeNull();
  });

  it("session renewed when <15 days left", async () => {
    const { db, user } = await setup();
    const { token } = await createSession(db, user.id, 0);
    const now = 20 * DAY;
    const res = await validateSession(db, token, now);
    expect(res?.expiresAt).toBe(now + 30 * DAY);
    const [row] = await db.select().from(s.sessions);
    expect(row.expiresAt).toBe(now + 30 * DAY);
  });

  it("session not renewed when >=15 days left", async () => {
    const { db, user } = await setup();
    const { token, expiresAt } = await createSession(db, user.id, 0);
    const res = await validateSession(db, token, 5 * DAY);
    expect(res?.expiresAt).toBe(expiresAt);
  });
});

describe("rate limit", () => {
  it("6th failed attempt for a username within 15 min is blocked", async () => {
    const { db } = await setup();
    for (let i = 0; i < 5; i++) {
      expect(await checkLoginAllowed(db, "Sam", `1.1.1.${i}`, 1000)).toBe(true);
      await recordFailedLogin(db, "Sam", `1.1.1.${i}`, 1000);
    }
    expect(await checkLoginAllowed(db, "sam", "9.9.9.9", 1000)).toBe(false);
    expect(await checkLoginAllowed(db, "other", "9.9.9.9", 1000)).toBe(true);
  });

  it("21st for an ip is blocked", async () => {
    const { db } = await setup();
    for (let i = 0; i < 20; i++) {
      expect(await checkLoginAllowed(db, `u${i}`, "2.2.2.2", 1000)).toBe(true);
      await recordFailedLogin(db, `u${i}`, "2.2.2.2", 1000);
    }
    expect(await checkLoginAllowed(db, "fresh", "2.2.2.2", 1000)).toBe(false);
  });

  it("allowed again after 15 min", async () => {
    const { db } = await setup();
    for (let i = 0; i < 5; i++)
      await recordFailedLogin(db, "sam", "3.3.3.3", 1000);
    expect(
      await checkLoginAllowed(db, "sam", "3.3.3.3", 1000 + 15 * 60_000 - 1),
    ).toBe(false);
    expect(
      await checkLoginAllowed(db, "sam", "3.3.3.3", 1000 + 15 * 60_000 + 1),
    ).toBe(true);
  });
});

describe("isPublicPath", () => {
  it("allows only the public paths", () => {
    for (const p of ["/login", "/join/abc", "/reset/abc", "/robots.txt"]) {
      expect(isPublicPath(p)).toBe(true);
    }
    for (const p of ["/", "/admin", "/u/sam", "/loginx", "/join"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});
