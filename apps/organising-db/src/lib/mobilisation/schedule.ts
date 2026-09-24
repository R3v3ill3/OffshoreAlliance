import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { MovementEvent } from "./movement";

/** How long an entry with no exit is painted ahead of the arrival day. */
const OPEN_STAY_DAYS = 45;
/** Longest explicit stay drawn on the calendar. */
const MAX_SPAN_DAYS = 180;
/** Longest duration taken from a sentence. */
const MAX_DURATION_DAYS = 540;

export interface StayWindow {
  arrivalAt: string | null;
  endsAt: string | null;
}

export interface CalendarSignal {
  signal_id: number;
  title: string;
  signal_type: string;
  occurred_at: string;
  arrival_at: string | null;
  ends_at: string | null;
  extract: string | null;
  source_layer: string;
  vessel_id: number | null;
  vessel_name: string | null;
  contractor_name: string | null;
}

export interface CalendarItem {
  signalId: number;
  label: string;
  kind: "eta" | "stay" | "on_site";
  /** Inclusive first day, local midnight. */
  start: Date;
  /** Inclusive last painted day. */
  end: Date;
  openEnded: boolean;
  /**
   * When a hull is still inside after the painted window, the calendar
   * also shows the chip on this day.
   */
  pinDay: Date | null;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const NAMED_DATE =
  /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+(\d{4})\b/gi;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DMY_DATE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/g;

const START_LABEL =
  /(?:\b(?:start(?:ing)? date|commencement(?: date)?|expected start|arrival date|mobilisation date|mobilization date|expected arrival|arriv(?:al|es|ed|e|ing)|starting|commencing|begins?|from)\s*:?\s*)$/i;
const END_LABEL =
  /(?:\b(?:end date|completion date|expected end|expected completion|departure date|demobilisation date|demobilization date|until|till)\s*:?\s*)$/i;

const DURATION_PATTERNS = [
  /\b(?:for|over|duration of|lasting)\s+(\d{1,3})\s*-?\s*(day|week|month)s?\b/i,
  /\b(\d{1,3})\s*-\s*(day|week|month)s?\s+(?:campaign|stay|programme|program)\b/i,
  /\b(\d{1,3})\s+(day|week|month)s?\s+(?:campaign|stay|programme|program|duration)\b/i,
];

interface FoundDate {
  index: number;
  endIndex: number;
  iso: string;
}

export function scheduleColumnMissing(message: string): boolean {
  return /arrival_at|ends_at/i.test(message) && /schema cache|does not exist|column/i.test(message);
}

function utcDate(year: number, monthIndex: number, day: number): string | null {
  if (day < 1 || day > 31 || monthIndex < 0 || monthIndex > 11 || year < 1990 || year > 2100) return null;
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) return null;
  return date.toISOString();
}

function addUtcDays(iso: string, days: number): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days)).toISOString();
}

function findDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  for (const match of text.matchAll(NAMED_DATE)) {
    const month = MONTH_INDEX[match[2]!.slice(0, 3).toLowerCase()];
    const iso = month == null ? null : utcDate(Number(match[3]), month, Number(match[1]));
    if (!iso || match.index == null) continue;
    found.push({ index: match.index, endIndex: match.index + match[0].length, iso });
  }
  for (const match of text.matchAll(ISO_DATE)) {
    const iso = utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!iso || match.index == null) continue;
    found.push({ index: match.index, endIndex: match.index + match[0].length, iso });
  }
  for (const match of text.matchAll(DMY_DATE)) {
    const iso = utcDate(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    if (!iso || match.index == null) continue;
    found.push({ index: match.index, endIndex: match.index + match[0].length, iso });
  }
  found.sort((a, b) => a.index - b.index || b.endIndex - a.endIndex);
  const kept: FoundDate[] = [];
  let cursor = -1;
  for (const item of found) {
    if (item.index < cursor) continue;
    kept.push(item);
    cursor = item.endIndex;
  }
  return kept;
}

function durationDays(text: string): number | null {
  for (const pattern of DURATION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const count = Number(match[1]);
    if (!Number.isFinite(count) || count < 1) continue;
    const unit = match[2]!.toLowerCase();
    const days = unit.startsWith("day") ? count : unit.startsWith("week") ? count * 7 : count * 30;
    if (days < 1) continue;
    return Math.min(days, MAX_DURATION_DAYS);
  }
  return null;
}

function clampWindow(start: string | null, end: string | null): StayWindow {
  if (!start) return { arrivalAt: null, endsAt: null };
  if (!end || end < start) return { arrivalAt: start, endsAt: null };
  const maxEnd = addUtcDays(start, MAX_DURATION_DAYS - 1);
  return { arrivalAt: start, endsAt: end > maxEnd ? maxEnd : end };
}

function isRangeConnector(between: string): boolean {
  if (between.length > 24) return false;
  return /^(?:to|until|through|and|till|[-–—])$/i.test(between.trim());
}

/**
 * Pull a campaign window out of filing or article text.
 * A duration on its own does not invent an arrival from the publication date.
 */
export function parseStayWindow(text: string): StayWindow {
  if (!text.trim()) return { arrivalAt: null, endsAt: null };
  const dates = findDates(text);
  for (let i = 0; i < dates.length - 1; i++) {
    const between = text.slice(dates[i]!.endIndex, dates[i + 1]!.index);
    if (!isRangeConnector(between)) continue;
    return clampWindow(dates[i]!.iso, dates[i + 1]!.iso);
  }

  let start: string | null = null;
  let end: string | null = null;
  for (const date of dates) {
    const before = text.slice(Math.max(0, date.index - 56), date.index);
    if (!start && START_LABEL.test(before)) start = date.iso;
    else if (!end && END_LABEL.test(before)) end = date.iso;
  }
  const duration = durationDays(text);
  if (start && !end && duration) end = addUtcDays(start, duration - 1);
  if (!start && end && duration) start = addUtcDays(end, -(duration - 1));
  return clampWindow(start, end);
}

/**
 * Arrival time for an AIS movement. Destination text is not an arrival:
 * a course-toward event only counts when its confidence is high enough
 * that the projected track enters the geofence.
 */
export function movementSchedule(
  observedAt: string,
  event: Pick<MovementEvent, "type" | "etaHours" | "confidence">
): StayWindow {
  if (event.type === "vessel_area_entry") return { arrivalAt: observedAt, endsAt: null };
  if (event.type !== "vessel_course_toward") return { arrivalAt: null, endsAt: null };
  if (event.confidence < 0.55 || event.etaHours == null || event.etaHours < 0) {
    return { arrivalAt: null, endsAt: null };
  }
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) return { arrivalAt: null, endsAt: null };
  return { arrivalAt: new Date(observed + event.etaHours * 3_600_000).toISOString(), endsAt: null };
}

function displayName(signal: CalendarSignal): string {
  return signal.vessel_name?.trim() || signal.contractor_name?.trim() || signal.title.trim() || "Mobilisation";
}

function instant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Items worth a calendar chip. Publication time alone is not an arrival.
 * An area exit closes an earlier entry for the same vessel and is not its own chip.
 */
export function buildCalendarItems(signals: CalendarSignal[], now: Date): CalendarItem[] {
  const exits = new Map<number, Date[]>();
  for (const signal of signals) {
    if (signal.signal_type !== "vessel_area_exit" || signal.vessel_id == null) continue;
    const at = instant(signal.occurred_at);
    if (!at) continue;
    const list = exits.get(signal.vessel_id) ?? [];
    list.push(at);
    exits.set(signal.vessel_id, list);
  }
  for (const list of exits.values()) list.sort((a, b) => a.getTime() - b.getTime());

  const today = startOfDay(now);
  const items: CalendarItem[] = [];

  for (const signal of signals) {
    if (signal.signal_type === "vessel_area_exit") continue;
    const parsed = parseStayWindow(`${signal.title}\n${signal.extract ?? ""}`);
    let arrivalIso: string | null = null;
    let endsIso: string | null = null;

    if (signal.signal_type === "vessel_course_toward") {
      if (!signal.arrival_at) continue;
      arrivalIso = signal.arrival_at;
      endsIso = signal.ends_at;
    } else if (signal.signal_type === "vessel_area_entry") {
      arrivalIso = signal.arrival_at ?? signal.occurred_at;
      endsIso = signal.ends_at ?? parsed.endsAt;
    } else {
      arrivalIso = signal.arrival_at ?? parsed.arrivalAt;
      endsIso = signal.ends_at ?? parsed.endsAt;
    }
    if (!arrivalIso) continue;

    const arrivalAt = instant(arrivalIso);
    if (!arrivalAt) continue;
    const start = startOfDay(arrivalAt);
    let endInstant = instant(endsIso);
    let openEnded = false;
    let kind: CalendarItem["kind"] = "eta";

    if (signal.signal_type === "vessel_area_entry" && !endInstant && signal.vessel_id != null) {
      const nextEntry = signals.reduce<number | null>((soonest, other) => {
        if (other.signal_id === signal.signal_id) return soonest;
        if (other.signal_type !== "vessel_area_entry" || other.vessel_id !== signal.vessel_id) return soonest;
        const otherAt = instant(other.arrival_at ?? other.occurred_at);
        if (!otherAt || otherAt.getTime() <= arrivalAt.getTime()) return soonest;
        return soonest == null || otherAt.getTime() < soonest ? otherAt.getTime() : soonest;
      }, null);
      const exit = (exits.get(signal.vessel_id) ?? []).find(
        (at) => at.getTime() >= arrivalAt.getTime() && (nextEntry == null || at.getTime() < nextEntry)
      );
      if (exit) endInstant = exit;
    }

    if (endInstant && endInstant.getTime() >= arrivalAt.getTime()) {
      kind = "stay";
    } else if (signal.signal_type === "vessel_area_entry" && start.getTime() <= today.getTime()) {
      kind = "on_site";
      openEnded = true;
      endInstant = addDays(start, OPEN_STAY_DAYS - 1);
    } else {
      kind = "eta";
      endInstant = arrivalAt;
    }

    let end = startOfDay(endInstant);
    if (end.getTime() < start.getTime()) end = start;
    if (kind === "stay") {
      const cap = addDays(start, MAX_SPAN_DAYS - 1);
      if (end.getTime() > cap.getTime()) end = cap;
    }

    const pinDay = openEnded && today.getTime() > end.getTime() ? today : null;
    const name = displayName(signal);
    const days = differenceInCalendarDays(end, start) + 1;
    const label =
      kind === "on_site"
        ? `${name} · on site`
        : kind === "stay"
          ? `${name} · ${Math.max(1, days)}d`
          : arrivalAt.getTime() > now.getTime()
            ? `${name} · ETA`
            : name;

    items.push({
      signalId: signal.signal_id,
      label,
      kind,
      start,
      end,
      openEnded,
      pinDay,
    });
  }

  items.sort((a, b) => a.start.getTime() - b.start.getTime() || a.signalId - b.signalId);
  return items;
}

export function itemCoversDay(item: CalendarItem, day: Date): boolean {
  const cursor = startOfDay(day);
  if (cursor.getTime() >= item.start.getTime() && cursor.getTime() <= item.end.getTime()) return true;
  return item.pinDay != null && cursor.getTime() === item.pinDay.getTime();
}
