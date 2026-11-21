import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { sessions, users } from "../db/schema";

export type SessionUser = {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
};

export const SESSION_COOKIE = "session";
const DAY = 24 * 60 * 60 * 1000;
const SESSION_LIFETIME = 30 * DAY;
const RENEW_BELOW = 15 * DAY;

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function createSession(
  db: Db,
  userId: number,
  now = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_LIFETIME;
  await db
    .insert(sessions)
    .values({ idHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSession(
  db: Db,
  token: string,
  now = Date.now(),
): Promise<{ user: SessionUser; expiresAt: number } | null> {
  const idHash = hashToken(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
      deactivatedAt: users.deactivatedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.idHash, idHash));
  if (!row) return null;
  if (row.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.idHash, idHash));
    return null;
  }
  if (row.deactivatedAt !== null) return null;
  let expiresAt = row.expiresAt;
  if (expiresAt - now < RENEW_BELOW) {
    expiresAt = now + SESSION_LIFETIME;
    await db
      .update(sessions)
      .set({ expiresAt })
      .where(eq(sessions.idHash, idHash));
  }
  return {
    user: {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      isAdmin: row.isAdmin,
    },
    expiresAt,
  };
}

export async function invalidateSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.idHash, hashToken(token)));
}

export async function invalidateUserSessions(
  db: Db,
  userId: number,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export function setSessionCookie(
  cookies: {
    set: (
      name: string,
      value: string,
      opts: Record<string, unknown> & { path: string },
    ) => void;
  },
  token: string,
  expiresAt: number,
): void {
  cookies.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    expires: new Date(expiresAt),
  });
}
