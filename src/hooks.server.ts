import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { getDb } from "./lib/server/db/client";
import { SESSION_COOKIE, validateSession } from "./lib/server/auth/session";
import { isPublicPath } from "./lib/server/auth/guard";

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(SESSION_COOKIE);
  const session = token ? await validateSession(getDb(), token) : null;
  event.locals.user = session?.user ?? null;

  if (!event.locals.user && !isPublicPath(event.url.pathname)) {
    redirect(
      303,
      `/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`,
    );
  }

  const response = await resolve(event);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
};
