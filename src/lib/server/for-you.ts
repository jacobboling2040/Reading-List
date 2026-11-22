import { and, eq, gte, isNull, notExists, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import {
  books,
  dismissals,
  follows,
  reviews,
  shelfEntries,
  users,
} from "./db/schema";
import { rowToBook, type Book } from "./books";
import { UserError } from "./errors";

export type ForYouCard = {
  book: Book;
  lovers: { username: string; displayName: string; rating: 4 | 5 }[];
  snippet: { displayName: string; body: string } | null;
  score: number;
  newestAt: number;
};

const WINDOW_MS = 30 * 86_400_000;
const SNIPPET_MAX = 140;

function truncate(text: string): string {
  const chars = Array.from(text);
  return chars.length > SNIPPET_MAX
    ? chars.slice(0, SNIPPET_MAX).join("") + "…"
    : text;
}

export async function getForYou(
  db: Db,
  userId: number,
  now = Date.now(),
  limit = 30,
): Promise<{ followsAnyone: boolean; cards: ForYouCard[] }> {
  // Follows of deactivated users are hidden, so "follows anyone" counts active followees only.
  const anyone = await db
    .select({ one: sql<number>`1` })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(and(eq(follows.followerId, userId), isNull(users.deactivatedAt)))
    .limit(1)
    .get();
  if (!anyone) return { followsAnyone: false, cards: [] };

  const rows = await db
    .select({
      book: books,
      username: users.username,
      displayName: users.displayName,
      rating: reviews.rating,
      body: reviews.body,
      updatedAt: reviews.updatedAt,
    })
    .from(reviews)
    .innerJoin(
      follows,
      and(
        eq(follows.followeeId, reviews.userId),
        eq(follows.followerId, userId),
      ),
    )
    .innerJoin(users, eq(users.id, reviews.userId))
    .innerJoin(books, eq(books.id, reviews.bookId))
    .where(
      and(
        gte(reviews.rating, 4),
        isNull(users.deactivatedAt),
        notExists(
          db
            .select({ one: sql`1` })
            .from(shelfEntries)
            .where(
              and(
                eq(shelfEntries.userId, userId),
                eq(shelfEntries.bookId, reviews.bookId),
              ),
            ),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(dismissals)
            .where(
              and(
                eq(dismissals.userId, userId),
                eq(dismissals.bookId, reviews.bookId),
              ),
            ),
        ),
      ),
    );

  const groups = new Map<number, typeof rows>();
  for (const r of rows) {
    const g = groups.get(r.book.id);
    if (g) g.push(r);
    else groups.set(r.book.id, [r]);
  }

  const cards: ForYouCard[] = [];
  for (const g of groups.values()) {
    // Newest review first; "newestAt" is the latest updatedAt among the loving reviews,
    // so a review edited recently counts as fresh.
    g.sort((a, b) => b.updatedAt - a.updatedAt);
    const newestAt = g[0].updatedAt;
    const withText = g.find((r) => r.body && r.body.trim() !== "");
    const lovers = [...g]
      .sort((a, b) => b.rating - a.rating || b.updatedAt - a.updatedAt)
      .map((r) => ({
        username: r.username,
        displayName: r.displayName,
        rating: r.rating as 4 | 5,
      }));
    cards.push({
      book: rowToBook(g[0].book),
      lovers,
      snippet: withText
        ? {
            displayName: withText.displayName,
            body: truncate(withText.body!.trim()),
          }
        : null,
      score: lovers.length + Math.max(0, 1 - (now - newestAt) / WINDOW_MS),
      newestAt,
    });
  }
  cards.sort((a, b) => b.score - a.score || b.newestAt - a.newestAt);
  return { followsAnyone: true, cards: cards.slice(0, limit) };
}

export async function dismiss(
  db: Db,
  userId: number,
  bookId: number,
): Promise<void> {
  // FKs are not reliably enforced remotely (R7), so verify the book exists.
  const book = await db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.id, bookId))
    .get();
  if (!book) throw new UserError("That book no longer exists.");
  await db.insert(dismissals).values({ userId, bookId }).onConflictDoNothing();
}
