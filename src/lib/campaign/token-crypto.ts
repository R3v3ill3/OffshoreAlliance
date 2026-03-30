import { createHash, randomBytes } from "crypto";

export function hashLeaderToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateRawLeaderToken(): string {
  return randomBytes(32).toString("hex");
}
