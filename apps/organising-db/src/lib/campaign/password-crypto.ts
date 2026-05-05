/**
 * Password hashing utilities for leader-form access (Phase 2 of Enhanced Leader Tasking).
 *
 * Crypto choice: `bcryptjs`. Reason — pure JS (no native binary), works on every Node
 * runtime including Vercel's serverless and edge fallbacks. Argon2 (`@node-rs/argon2`)
 * is faster but ships a native binary that has historically caused issues on serverless
 * deployments. Cost factor 12 is a balanced choice (~250ms on a modern CPU).
 *
 * Phase 1 set the DB column `campaign_leader_tokens.password_algo` default to
 * `'argon2id'`. Phase 2 always writes `'bcrypt'` explicitly. Verifier rejects anything
 * other than `'bcrypt'` so legacy / pre-Phase-2 rows (which were auto-revoked in Phase 1)
 * cannot be authenticated against.
 */
import bcrypt from "bcryptjs";

export type PasswordHashResult = { hash: string; algo: "bcrypt" };

const COST_FACTOR = 12;
const MIN_PASSWORD_LENGTH = 6;

export async function hashPassword(plain: string): Promise<PasswordHashResult> {
  if (typeof plain !== "string" || plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const hash = await bcrypt.hash(plain, COST_FACTOR);
  return { hash, algo: "bcrypt" };
}

export async function verifyPassword(
  plain: string,
  hash: string,
  algo: string,
): Promise<boolean> {
  if (algo !== "bcrypt") {
    throw new Error(`Unsupported password algorithm: ${algo}`);
  }
  if (typeof plain !== "string" || plain.length === 0) return false;
  if (typeof hash !== "string" || hash.length === 0) return false;
  return bcrypt.compare(plain, hash);
}
