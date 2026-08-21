/**
 * iOS / Android SMS tapbacks (Like/Loved/…) arrive as a new inbound
 * text that quotes the original body. Parse them so the inbox can show
 * a reaction chip on the parent instead of a full reply bubble.
 *
 * Pure module — unit tested in __tests__/tapback.test.ts.
 */

export type SmsTapbackKind =
  | "like"
  | "love"
  | "dislike"
  | "laugh"
  | "emphasize"
  | "question"
  | "emoji";

export interface ParsedSmsTapback {
  kind: SmsTapbackKind;
  emoji: string;
  quoted: string;
}

export interface SmsMessageReaction {
  kind: SmsTapbackKind;
  emoji: string;
  from_e164: string | null;
  at: string;
  provider_message_id: string | null;
}

export const TAPBACK_KIND_LABEL: Record<SmsTapbackKind, string> = {
  like: "Liked",
  love: "Loved",
  dislike: "Disliked",
  laugh: "Laughed",
  emphasize: "Emphasized",
  question: "Questioned",
  emoji: "Reacted",
};

/**
 * Longer prefixes first so "Gefällt nicht" wins over "Gefällt",
 * "J'adore" over "J'aime", etc.
 */
const PREFIXES: Array<{
  kind: SmsTapbackKind;
  emoji: string;
  prefixes: string[];
}> = [
  {
    kind: "laugh",
    emoji: "😂",
    prefixes: [
      "laughed at",
      "laut gelacht",
      "haha",
      "se ha reído",
      "se ha reido",
      "a ri",
    ],
  },
  {
    kind: "emphasize",
    emoji: "‼️",
    prefixes: ["emphasized", "hervorgehoben", "nachdrücklich", "ha enfatizado"],
  },
  {
    kind: "question",
    emoji: "❓",
    prefixes: ["questioned", "hinterfragt", "ha preguntado"],
  },
  {
    kind: "dislike",
    emoji: "👎",
    prefixes: [
      "disliked",
      "gefällt mir nicht",
      "gefällt nicht",
      "je n'aime pas",
      "je n’aime pas",
      "no le ha gustado",
    ],
  },
  {
    kind: "love",
    emoji: "❤️",
    prefixes: [
      "loved",
      "geliebt",
      "j'adore",
      "j’adore",
      "le ha encantado",
      "a adoré",
      "a adore",
    ],
  },
  {
    kind: "like",
    emoji: "👍",
    prefixes: [
      "liked",
      "gefällt mir",
      "gefällt",
      "j'aime",
      "j’aime",
      "le ha gustado",
      "a aimé",
      "a aime",
    ],
  },
];

const OPEN_QUOTE = /[„“"«‹「『‚]/;

/** Opener → closers. Apostrophes are not closers — originals contain don't / we've. */
const QUOTE_PAIRS: Array<[string, string[]]> = [
  ["„", ["“", "”"]],
  ["“", ["”"]],
  ['"', ['"']],
  ["«", ["»"]],
  ["‹", ["›"]],
  ["「", ["」"]],
  ["『", ["』"]],
  ["‚", ["‘"]],
];

function collapseWs(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractQuoted(rest: string): string {
  const trimmed = rest.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (/^an?\s+(image|photo|movie|video|attachment)\.?$/u.test(lower)) {
    return "";
  }
  const opener = trimmed[0] ?? "";
  const closers = QUOTE_PAIRS.find(([open]) => open === opener)?.[1];
  if (!closers) return collapseWs(trimmed);

  let end = -1;
  for (let i = trimmed.length - 1; i > 0; i--) {
    if (closers.includes(trimmed[i] ?? "")) {
      end = i;
      break;
    }
  }
  const inner = end > 0 ? trimmed.slice(1, end) : trimmed.slice(1);
  return collapseWs(inner);
}

const REACTED_RE =
  /^reacted\s+(\p{Extended_Pictographic}|[^\s]+)\s+to\s+/iu;

/**
 * Return a parsed tapback when `body` is an iOS/Android SMS reaction
 * fallback; otherwise null (treat as a normal inbound).
 */
export function parseSmsTapback(body: string | null | undefined): ParsedSmsTapback | null {
  if (!body) return null;
  const text = body.replace(/^\uFEFF/, "").trim();
  if (!text) return null;

  const removed = /^(removed\s+(a\s+)?(like|love|dislike|laugh|emphasis|question)\b)/iu;
  if (removed.test(text)) return null;

  const reacted = text.match(REACTED_RE);
  if (reacted) {
    return {
      kind: "emoji",
      emoji: reacted[1],
      quoted: extractQuoted(text.slice(reacted[0].length)),
    };
  }

  const lower = text.toLowerCase();
  for (const row of PREFIXES) {
    for (const prefix of row.prefixes) {
      if (!lower.startsWith(prefix)) continue;
      const after = text.slice(prefix.length);
      if (after.length > 0 && !/^[\s:：]/.test(after)) continue;
      const rest = after.replace(/^[\s:：]+/, "");
      // Real sentences ("Gefällt mir das Angebot") must not match.
      // Tapbacks always quote the original, or refer to "an image".
      if (
        rest.length > 0 &&
        !OPEN_QUOTE.test(rest[0] ?? "") &&
        !/^an?\s+(image|photo|movie|video|attachment)\.?$/iu.test(rest)
      ) {
        continue;
      }
      return {
        kind: row.kind,
        emoji: row.emoji,
        quoted: extractQuoted(rest),
      };
    }
  }
  return null;
}

export function quotedMatchesBody(
  body: string | null | undefined,
  quoted: string,
): boolean {
  if (!body || !quoted) return false;
  const hay = collapseWs(body);
  const needle = collapseWs(quoted.replace(/[.…]+$/u, ""));
  if (!needle) return false;
  return hay === collapseWs(quoted) || hay.startsWith(needle);
}

type FoldableMessage = {
  message_id: number;
  direction: string;
  body: string | null;
  created_at: string;
  provider_message_id: string | null;
  reactions?: SmsMessageReaction[] | null;
};

function findParentInThread<T extends FoldableMessage>(
  messages: T[],
  tapback: ParsedSmsTapback,
  childId: number,
): T | null {
  const earlier = messages.filter((m) => m.message_id !== childId);
  if (tapback.quoted) {
    const hit = [...earlier]
      .reverse()
      .find(
        (m) =>
          m.direction === "outbound" && quotedMatchesBody(m.body, tapback.quoted),
      );
    if (hit) return hit;
  }
  const outbound = [...earlier].reverse().find((m) => m.direction === "outbound");
  return outbound ?? null;
}

/**
 * Hide inbound tapback bubbles and attach them as reactions on the
 * quoted parent. Covers rows stored before the webhook learnt to
 * swallow them. Messages whose parent is not in the loaded page are
 * left as bubbles.
 */
export function foldTapbackMessages<T extends FoldableMessage>(messages: T[]): T[] {
  const copies = new Map<number, T>(
    messages.map((m) => [
      m.message_id,
      { ...m, reactions: [...(m.reactions ?? [])] },
    ]),
  );
  const hide = new Set<number>();

  for (const m of messages) {
    if (m.direction !== "inbound" || !m.body) continue;
    const parsed = parseSmsTapback(m.body);
    if (!parsed) continue;
    const parent = findParentInThread(messages, parsed, m.message_id);
    if (!parent) continue;
    const target = copies.get(parent.message_id);
    if (!target) continue;
    hide.add(m.message_id);
    const reactions = target.reactions ?? [];
    const dup = reactions.some(
      (r) =>
        r.provider_message_id != null &&
        r.provider_message_id === m.provider_message_id,
    );
    if (!dup) {
      reactions.push({
        kind: parsed.kind,
        emoji: parsed.emoji,
        from_e164: null,
        at: m.created_at,
        provider_message_id: m.provider_message_id,
      });
      copies.set(parent.message_id, { ...target, reactions });
    }
  }

  return messages
    .filter((m) => !hide.has(m.message_id))
    .map((m) => copies.get(m.message_id) ?? m);
}
