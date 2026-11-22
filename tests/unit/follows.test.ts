import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../src/lib/server/db/test-db";
import type { Db } from "../../src/lib/server/db/client";
import { users, follows } from "../../src/lib/server/db/schema";
import { addManualBook } from "../../src/lib/server/books";
import { setShelf } from "../../src/lib/server/shelves";
import { saveReview } from "../../src/lib/server/reviews";
import {
  follow,
  unfollow,
  isFollowing,
  listMembers,
  getProfile,
} from "../../src/lib/server/follows";

let db: Db;

async function mkUser(username: string, displayName = username) {
  const [u] = await db
    .insert(users)
    .values({ username, displayName, passwordHash: "x", createdAt: 1 })
    .returning({ id: users.id });
  return u.id;
}

beforeEach(async () => {
  db = await createTestDb();
});

describe("follows", () => {
  it("follow is idempotent", async () => {
    const a = await mkUser("a");
    const b = await mkUser("b");
    await follow(db, a, b);
    await follow(db, a, b);
    expect(await db.select().from(follows)).toHaveLength(1);
    expect(await isFollowing(db, a, b)).toBe(true);
    expect(await isFollowing(db, b, a)).toBe(false);
    await unfollow(db, a, b);
    expect(await isFollowing(db, a, b)).toBe(false);
  });

  it("self-follow throws message", async () => {
    const a = await mkUser("a");
    await expect(follow(db, a, a)).rejects.toThrow(
      "You can't follow yourself.",
    );
  });

  it("404 for missing or deactivated followee", async () => {
    const a = await mkUser("a");
    const b = await mkUser("b");
    await db.update(users).set({ deactivatedAt: 5 }).where(eq(users.id, b));
    await expect(follow(db, a, b)).rejects.toMatchObject({ status: 404 });
    await expect(follow(db, a, 999)).rejects.toMatchObject({ status: 404 });
  });

  it("listMembers excludes viewer and deactivated, marks following", async () => {
    const a = await mkUser("a", "Zed");
    const b = await mkUser("b", "alice");
    const c = await mkUser("c", "Bob");
    const d = await mkUser("d", "Gone");
    await db.update(users).set({ deactivatedAt: 5 }).where(eq(users.id, d));
    await follow(db, a, c);
    const list = await listMembers(db, a);
    expect(list).toEqual([
      { id: b, username: "b", displayName: "alice", following: false },
      { id: c, username: "c", displayName: "Bob", following: true },
    ]);
  });

  it("getProfile null for deactivated", async () => {
    const a = await mkUser("a");
    expect(await getProfile(db, "nobody")).toBeNull();
    await db.update(users).set({ deactivatedAt: 5 }).where(eq(users.id, a));
    expect(await getProfile(db, "a")).toBeNull();
  });

  it("profile counts match shelves", async () => {
    const a = await mkUser("a", "Ann");
    const b1 = await addManualBook(db, { title: "One", author: "X" }, a);
    const b2 = await addManualBook(db, { title: "Two", author: "X" }, a);
    const b3 = await addManualBook(db, { title: "Three", author: "X" }, a);
    await setShelf(db, a, b1, "reading");
    await setShelf(db, a, b2, "to_read");
    await saveReview(db, a, b3, { rating: 4, body: "good" });
    const p = await getProfile(db, "A");
    expect(p!.username).toBe("a");
    expect(p!.counts).toEqual({ to_read: 1, reading: 1, finished: 1 });
    expect(p!.readingNow.map((x) => x.title)).toEqual(["One"]);
    expect(p!.recentReviews).toHaveLength(1);
    expect(p!.recentReviews[0].rating).toBe(4);
    expect(p).not.toHaveProperty("followers");
  });
});
