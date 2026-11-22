import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { error } from "@sveltejs/kit";
import type { Db } from "./db/client";
import { follows, users } from "./db/schema";
import type { Book } from "./books";
import { listShelf, shelfCounts, type ShelfStatus } from "./shelves";
import { listUserReviews } from "./reviews";
import { UserError } from "./errors";

export async function follow(
  db: Db,
  followerId: number,
  followeeId: number,
  now = Date.now(),
): Promise<void> {
  if (followerId === followeeId)
    throw new UserError("You can't follow yourself.");
  const target = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, followeeId), isNull(users.deactivatedAt)))
    .get();
  if (!target) error(404, "Not found");
  await db
    .insert(follows)
    .values({ followerId, followeeId, createdAt: now })
    .onConflictDoNothing();
}

export async function unfollow(
  db: Db,
  followerId: number,
  followeeId: number,
): Promise<void> {
  await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, followerId),
        eq(follows.followeeId, followeeId),
      ),
    );
}

export async function isFollowing(
  db: Db,
  a: number,
  b: number,
): Promise<boolean> {
  const row = await db
    .select({ n: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, a), eq(follows.followeeId, b)))
    .get();
  return !!row;
}

export async function listMembers(
  db: Db,
  viewerId: number,
): Promise<
  { id: number; username: string; displayName: string; following: boolean }[]
> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      followed: follows.followeeId,
    })
    .from(users)
    .leftJoin(
      follows,
      and(eq(follows.followeeId, users.id), eq(follows.followerId, viewerId)),
    )
    .where(and(isNull(users.deactivatedAt), ne(users.id, viewerId)))
    .orderBy(asc(sql`lower(${users.displayName})`), asc(users.username));
  return rows.map(({ followed, ...r }) => ({
    ...r,
    following: followed !== null,
  }));
}

export async function getProfile(db: Db, username: string) {
  const user = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(
      and(
        eq(users.username, username.toLowerCase()),
        isNull(users.deactivatedAt),
      ),
    )
    .get();
  if (!user) return null;
  const [readingNow, counts, recentReviews] = await Promise.all([
    listShelf(db, user.id, "reading"),
    shelfCounts(db, user.id),
    listUserReviews(db, user.id, 10),
  ]);
  return {
    ...user,
    readingNow: readingNow as Book[],
    counts: counts as Record<ShelfStatus, number>,
    recentReviews,
  };
}
