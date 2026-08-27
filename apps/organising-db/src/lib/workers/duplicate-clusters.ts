import { nameKey, normaliseEmail, normalisePhone } from "@/lib/import/worker-matching";

export type DuplicateReason = "email" | "phone" | "name";

export type DuplicateCandidate = {
  worker_id: number;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  email: string | null;
  phone: string | null;
  employer_name?: string | null;
  worksite_name?: string | null;
  occupation?: string | null;
  created_at?: string | null;
};

export type DuplicateCluster = {
  cluster_id: string;
  reasons: DuplicateReason[];
  confidence: "high" | "name";
  suggested_keep_id: number;
  workers: DuplicateCandidate[];
};

class UnionFind {
  private parent = new Map<number, number>();

  add(id: number) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: number): number {
    this.add(id);
    const p = this.parent.get(id)!;
    if (p !== id) {
      const root = this.find(p);
      this.parent.set(id, root);
      return root;
    }
    return id;
  }

  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function pushId(map: Map<string, number[]>, key: string | null, id: number) {
  if (!key) return;
  const arr = map.get(key);
  if (arr) arr.push(id);
  else map.set(key, [id]);
}

function filledScore(w: DuplicateCandidate): number {
  let n = 0;
  if (w.email) n += 3;
  if (w.phone) n += 3;
  if (w.employer_name) n += 1;
  if (w.worksite_name) n += 1;
  if (w.occupation) n += 1;
  if (w.preferred_name) n += 1;
  return n;
}

function collectGroups(
  workers: DuplicateCandidate[],
  uf: UnionFind
): DuplicateCandidate[][] {
  const groups = new Map<number, DuplicateCandidate[]>();
  for (const w of workers) {
    const root = uf.find(w.worker_id);
    const arr = groups.get(root);
    if (arr) arr.push(w);
    else groups.set(root, [w]);
  }
  return [...groups.values()].filter((members) => members.length >= 2);
}

function toCluster(
  members: DuplicateCandidate[],
  confidence: DuplicateCluster["confidence"]
): DuplicateCluster {
  const reasonSet = new Set<DuplicateReason>();
  if (confidence !== "name") {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        for (const r of pairReasons(members[i], members[j])) reasonSet.add(r);
      }
    }
  }
  const reasons =
    confidence === "name"
      ? (["name"] as DuplicateReason[])
      : (["email", "phone", "name"] as const).filter((r) => reasonSet.has(r));
  const sorted = [...members].sort((a, b) => {
    const score = filledScore(b) - filledScore(a);
    if (score !== 0) return score;
    return a.worker_id - b.worker_id;
  });
  return {
    cluster_id: sorted.map((w) => w.worker_id).join("-"),
    reasons,
    confidence,
    suggested_keep_id: sorted[0].worker_id,
    workers: sorted,
  };
}

function isSubset(inner: DuplicateCandidate[], outerSets: Set<number>[]): boolean {
  const ids = inner.map((w) => w.worker_id);
  return outerSets.some((set) => ids.every((id) => set.has(id)));
}

function pairReasons(a: DuplicateCandidate, b: DuplicateCandidate): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  const ea = normaliseEmail(a.email);
  const eb = normaliseEmail(b.email);
  if (ea && eb && ea === eb) reasons.push("email");
  const pa = normalisePhone(a.phone);
  const pb = normalisePhone(b.phone);
  if (pa && pb && pa === pb) reasons.push("phone");
  const namesA = new Set(
    [
      nameKey(a.first_name, a.last_name),
      nameKey(a.preferred_name ?? "", a.last_name),
    ].filter(Boolean) as string[]
  );
  const namesB = [
    nameKey(b.first_name, b.last_name),
    nameKey(b.preferred_name ?? "", b.last_name),
  ].filter(Boolean) as string[];
  if (namesB.some((k) => namesA.has(k))) reasons.push("name");
  return reasons;
}

/**
 * Group campaign members that share an email, phone, or first+last name.
 * Name-only groups are flagged as lower confidence so the UI can require
 * an explicit confirm before acting.
 */
export function findDuplicateClusters(workers: DuplicateCandidate[]): DuplicateCluster[] {
  const ufContact = new UnionFind();
  const ufName = new UnionFind();
  for (const w of workers) {
    ufContact.add(w.worker_id);
    ufName.add(w.worker_id);
  }

  const byEmail = new Map<string, number[]>();
  const byPhone = new Map<string, number[]>();
  const byName = new Map<string, number[]>();
  for (const w of workers) {
    pushId(byEmail, normaliseEmail(w.email), w.worker_id);
    pushId(byPhone, normalisePhone(w.phone), w.worker_id);
    pushId(byName, nameKey(w.first_name, w.last_name), w.worker_id);
    const pk = nameKey(w.preferred_name ?? "", w.last_name);
    const nk = nameKey(w.first_name, w.last_name);
    if (pk && pk !== nk) pushId(byName, pk, w.worker_id);
  }

  const unionBucket = (uf: UnionFind, map: Map<string, number[]>) => {
    for (const ids of map.values()) {
      if (ids.length < 2) continue;
      for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
    }
  };
  // Email/phone only for auto-suggested groups. Name matches are clustered
  // separately so a third person who merely shares a name is not swept into
  // a high-confidence merge.
  unionBucket(ufContact, byEmail);
  unionBucket(ufContact, byPhone);
  unionBucket(ufName, byName);

  const highGroups = collectGroups(workers, ufContact);
  const highIdSets = highGroups.map((g) => new Set(g.map((w) => w.worker_id)));
  const clusters: DuplicateCluster[] = highGroups.map((members) => toCluster(members, "high"));

  for (const members of collectGroups(workers, ufName)) {
    if (isSubset(members, highIdSets)) continue;
    clusters.push(toCluster(members, "name"));
  }

  clusters.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
    return b.workers.length - a.workers.length;
  });
  return clusters;
}

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  email: "Same email",
  phone: "Same phone",
  name: "Same name",
};
