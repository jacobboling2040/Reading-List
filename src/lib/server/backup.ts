import type { Db } from "./db/client";

// Tables whose rows are transient; their schema is kept so a restore is complete.
const SCHEMA_ONLY = new Set(["sessions", "login_attempts"]);

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "string") return `'${v.replaceAll("'", "''")}'`;
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const bytes =
      v instanceof ArrayBuffer
        ? new Uint8Array(v)
        : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return `X'${Buffer.from(bytes).toString("hex")}'`;
  }
  throw new Error(`Cannot dump value of type ${typeof v}`);
}

/** A SQL script (schema plus INSERTs) that recreates every table except transient session data. */
export async function dumpDatabase(db: Db): Promise<string> {
  const client = db.$client;
  const master = await client.execute(
    `SELECT name, sql, type FROM sqlite_master
		 WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_\\_drizzle%' ESCAPE '\\'
		   AND sql IS NOT NULL AND type IN ('table', 'index')
		 ORDER BY (type = 'table') DESC, rowid`,
  );
  const out = ["PRAGMA foreign_keys=OFF;", "BEGIN;"];
  const tables: string[] = [];
  for (const row of master.rows) {
    out.push(`${row.sql};`);
    if (row.type === "table") tables.push(String(row.name));
  }
  for (const name of tables) {
    if (SCHEMA_ONLY.has(name)) continue;
    const rows = await client.execute(`SELECT * FROM ${quoteIdent(name)}`);
    for (const r of rows.rows) {
      const values = rows.columns.map((_, i) => literal(r[i]));
      out.push(
        `INSERT INTO ${quoteIdent(name)} VALUES (${values.join(", ")});`,
      );
    }
  }
  out.push("COMMIT;");
  return out.join("\n") + "\n";
}
