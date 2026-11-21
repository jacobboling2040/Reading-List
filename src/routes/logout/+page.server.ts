import { redirect } from "@sveltejs/kit";
import { getDb } from "../../lib/server/db/client";
import {
  invalidateSession,
  SESSION_COOKIE,
} from "../../lib/server/auth/session";
import type { Actions, PageServerLoad } from "./$types";

// POST-only: a GET just goes home.
export const load: PageServerLoad = () => redirect(303, "/");

export const actions: Actions = {
  default: async ({ cookies }) => {
    const token = cookies.get(SESSION_COOKIE);
    if (token) await invalidateSession(getDb(), token);
    cookies.delete(SESSION_COOKIE, { path: "/" });
    redirect(303, "/login");
  },
};
