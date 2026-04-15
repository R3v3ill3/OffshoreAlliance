function trimStr(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

/**
 * Human-readable worker label for tables and pickers.
 * Prefers preferred name, then legal name, then contact / member identifiers.
 */
export function formatWorkerLabel(workerId: number, worker: Record<string, unknown>): string {
  const preferred = trimStr(worker.preferred_name);
  if (preferred) return preferred;

  const first = trimStr(worker.first_name);
  const last = trimStr(worker.last_name);
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (first) return first;
  if (last) return last;

  const email = trimStr(worker.email);
  if (email) return email;

  const phone = trimStr(worker.phone);
  if (phone) return phone;

  const memberNumber = trimStr(worker.member_number);
  if (memberNumber) return memberNumber;

  return `Worker #${workerId}`;
}
