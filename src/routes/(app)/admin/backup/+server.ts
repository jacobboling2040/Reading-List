import { getDb } from "../../../../lib/server/db/client";
import { dumpDatabase } from "../../../../lib/server/backup";
import { requireAdmin } from "../../../../lib/server/auth/guard";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  requireAdmin(locals);
  const sql = await dumpDatabase(getDb());
  const day = new Date().toISOString().slice(0, 10);
  return new Response(sql, {
    headers: {
      "Content-Type": "application/sql; charset=utf-8",
      "Content-Disposition": `attachment; filename="reading-list-${day}.sql"`,
      "Cache-Control": "no-store",
    },
  });
};
