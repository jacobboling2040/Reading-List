import { hash, verify } from "@node-rs/argon2";

// 2 = Algorithm.Argon2id (const enum, so the numeric value is used under isolatedModules)
const ARGON2ID = 2;

export function hashPassword(pw: string): Promise<string> {
  return hash(pw, { algorithm: ARGON2ID });
}

export async function verifyPassword(
  hashed: string,
  pw: string,
): Promise<boolean> {
  try {
    return await verify(hashed, pw);
  } catch {
    return false;
  }
}
