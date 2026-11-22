import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../src/lib/server/db/test-db";
import type { Db } from "../../src/lib/server/db/client";
import {
  users,
  follows,
  reviews,
  shelfEntries,
} from "../../src/lib/server/db/schema";
import { addManualBook } from "../../src/lib/server/books";
import { getForYou, dismiss } from "../../src/lib/server/for-you";

const DAY = 86_400_000;
const NOW = 100 * DAY;

let db: Db;
let me: number;

async function mkUser(name: string) {
  const [u] = await db
    .insert(users)
    .values({
      username: name,
      displayName: name.toUpperCase(),
      passwordHash: "x",
      createdAt: 1,
    })
    .returning({ id: users.id });
  return u.id;
}
async function mkBook(title: string) {
  return addManualBook(db, { title, author: "X" }, me);
}
async function follow(f: number, t: number) {
  await db
    .insert(follows)
    .values({ followerId: f, followeeId: t, createdAt: 1 });
}
async function review(
  userId: number,
  bookId: number,
  rating: number,
  at = NOW,
  body: string | null = null,
) {
  await db
    .insert(reviews)
    .values({ userId, bookId, rating, body, createdAt: at, updatedAt: at });
}

beforeEach(async () => {
  db = await createTestDb();
  me = await mkUser("me");
});

describe("getForYou", () => {
  it("only followed users count", async () => {
    const f = await mkUser("f");
    const o = await mkUser("o");
    await follow(me, f);
    const b1 = await mkBook("One");
    const b2 = await mkBook("Two");
    await review(f, b1, 5);
    await review(o, b2, 5);
    const r = await getForYou(db, me, NOW);
    expect(r.followsAnyone).toBe(true);
    expect(r.cards.map((c) => c.book.id)).toEqual([b1]);
    expect(r.cards[0].lovers).toEqual([
      { username: "f", displayName: "F", rating: 5 },
    ]);
  });

  it("ratings <=3 ignored", async () => {
    const f = await mkUser("f");
    await follow(me, f);
    const b = await mkBook("One");
    await review(f, b, 3);
    expect((await getForYou(db, me, NOW)).cards).toEqual([]);
  });

  it("shelved and dismissed books excluded", async () => {
    const f = await mkUser("f");
    await follow(me, f);
    const b1 = await mkBook("One");
    const b2 = await mkBook("Two");
    const b3 = await mkBook("Three");
    for (const b of [b1, b2, b3]) await review(f, b, 5);
    await db
      .insert(shelfEntries)
      .values({ userId: me, bookId: b1, status: "to_read", updatedAt: 1 });
    await dismiss(db, me, b2);
    await dismiss(db, me, b2);
    expect((await getForYou(db, me, NOW)).cards.map((c) => c.book.id)).toEqual([
      b3,
    ]);
  });

  it("dismiss rejects unknown book", async () => {
    await expect(dismiss(db, me, 999)).rejects.toThrow(
      "That book no longer exists.",
    );
  });

  it("deactivated followee's ratings ignored", async () => {
    const f = await mkUser("f");
    await follow(me, f);
    const b = await mkBook("One");
    await review(f, b, 5);
    await db.update(users).set({ deactivatedAt: 5 }).where(eq(users.id, f));
    expect((await getForYou(db, me, NOW)).cards).toEqual([]);
  });

  it("two lovers outrank one fresh lover", async () => {
    const f1 = await mkUser("f1");
    const f2 = await mkUser("f2");
    await follow(me, f1);
    await follow(me, f2);
    const two = await mkBook("Two lovers");
    const one = await mkBook("One lover");
    await review(f1, two, 4, NOW - 29 * DAY);
    await review(f2, two, 5, NOW - 29 * DAY);
    await review(f1, one, 5, NOW);
    const r = await getForYou(db, me, NOW);
    expect(r.cards.map((c) => c.book.id)).toEqual([two, one]);
    expect(r.cards[0].lovers.map((l) => l.rating)).toEqual([5, 4]);
  });

  it("fresh review outranks 40-day-old review with same lover count", async () => {
    const f = await mkUser("f");
    await follow(me, f);
    const old = await mkBook("Old");
    const fresh = await mkBook("Fresh");
    await review(f, old, 5, NOW - 40 * DAY);
    await review(f, fresh, 5, NOW - 1 * DAY);
    const r = await getForYou(db, me, NOW);
    expect(r.cards.map((c) => c.book.id)).toEqual([fresh, old]);
    expect(r.cards[1].score).toBe(1);
  });

  it("followsAnyone false when following nobody", async () => {
    const r = await getForYou(db, me, NOW);
    expect(r).toEqual({ followsAnyone: false, cards: [] });
  });

  it("snippet truncated at 140 chars, newest non-empty text", async () => {
    const f1 = await mkUser("f1");
    const f2 = await mkUser("f2");
    await follow(me, f1);
    await follow(me, f2);
    const b = await mkBook("One");
    await review(f1, b, 5, NOW - DAY, "x".repeat(200));
    await review(f2, b, 5, NOW, "   ");
    const c = (await getForYou(db, me, NOW)).cards[0];
    expect(c.snippet).toEqual({
      displayName: "F1",
      body: "x".repeat(140) + "…",
    });
    expect(c.newestAt).toBe(NOW);
  });

  it("snippet null when no text; respects limit", async () => {
    const f = await mkUser("f");
    await follow(me, f);
    for (let i = 0; i < 3; i++)
      await review(f, await mkBook("B" + i), 5, NOW - i);
    const r = await getForYou(db, me, NOW, 2);
    expect(r.cards).toHaveLength(2);
    expect(r.cards[0].snippet).toBeNull();
  });
});
