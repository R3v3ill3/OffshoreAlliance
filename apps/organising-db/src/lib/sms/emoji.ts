/**
 * Curated emoji palette for the SMS composers.
 *
 * Deliberately a short hand-picked list rather than a full emoji
 * keyboard: organisers reach for the same dozen or so, and every
 * emoji carries a real cost. Any non-GSM-7 character switches the
 * whole message to UCS-2, which cuts capacity from 160 characters per
 * part to 70 — so one thumbs-up can turn a one-part send into two,
 * doubling the credits for the entire batch. Keeping the set small
 * and obvious is the point; the OS emoji keyboard still works for
 * anything not listed here.
 *
 * Excluded on purpose:
 *   - skin-tone modifiers and ZWJ sequences (👨‍👩‍👧, 👍🏽): several code
 *     units each, and they degrade badly on older handsets;
 *   - anything whose meaning depends on the recipient's renderer.
 *
 * Pure module — unit tested in __tests__/emoji.test.ts.
 */

export interface EmojiGroup {
  /** Section label in the picker. */
  label: string;
  emoji: string[];
}

export const SMS_EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: "Reactions",
    emoji: ["👍", "👎", "👏", "🙌", "💪", "✊", "🤝", "🙏"],
  },
  {
    label: "Faces",
    emoji: ["🙂", "😀", "😂", "😅", "😉", "😊", "🤔", "😬", "😡", "😢"],
  },
  {
    label: "Signals",
    emoji: ["✅", "❌", "⚠️", "❗", "❓", "🔴", "🟢", "⭐", "🔥", "💯"],
  },
  {
    label: "Organising",
    emoji: ["📅", "⏰", "📍", "📢", "📝", "📄", "☎️", "💬", "🗳️", "⚖️"],
  },
  {
    label: "Work",
    emoji: ["🚢", "⛴️", "🛠️", "⚓", "🦺", "🏭", "💰", "📈"],
  },
];

/** Flat list — handy for tests and for a "recently used" lookup. */
export const SMS_EMOJI_ALL: string[] = SMS_EMOJI_GROUPS.flatMap(
  (g) => g.emoji
);

/**
 * True when the text contains at least one emoji-ish character.
 *
 * Intentionally broad (pictographic + variation selectors + ZWJ): this
 * drives an advisory composer hint, so a false positive costs nothing
 * while a miss would hide a real billing surprise. `countSegments` —
 * not this — decides the actual encoding.
 */
export function hasEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}|️|‍/u.test(text);
}
