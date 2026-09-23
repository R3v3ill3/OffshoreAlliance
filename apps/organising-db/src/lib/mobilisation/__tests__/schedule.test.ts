import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { draftFromArticle } from "../parse/commercial";
import { draftFromNopsema } from "../parse/nopsema";
import {
  buildCalendarItems,
  itemCoversDay,
  movementSchedule,
  parseStayWindow,
  type CalendarSignal,
} from "../schedule";
import type { Watchlist } from "../types";

const watch: Watchlist = {
  contractors: [
    {
      watch_id: 1,
      canonical_name: "Saipem",
      aliases: [],
      employer_id: 10,
      asx_ticker: null,
      tier: "core",
      is_active: true,
    },
  ],
  vessels: [
    {
      vessel_id: 5,
      name: "Castorone",
      imo: "9455555",
      owner_name: "Saipem",
      owner_operator_id: 10,
      relevance: "nw",
      is_active: true,
    },
  ],
  keywords: [
    { keyword_id: 1, keyword: "Australia", kind: "region", asx_ticker: null, is_active: true },
    { keyword_id: 2, keyword: "Woodside", kind: "operator", asx_ticker: "WDS", is_active: true },
    { keyword_id: 3, keyword: "Scarborough", kind: "project", asx_ticker: null, is_active: true },
  ],
  worksites: [],
};

function day(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

function signal(partial: Partial<CalendarSignal> & Pick<CalendarSignal, "signal_id" | "signal_type">): CalendarSignal {
  return {
    title: "Castorone",
    occurred_at: "2026-09-01T02:00:00.000Z",
    arrival_at: null,
    ends_at: null,
    extract: null,
    source_layer: "ais",
    vessel_id: 5,
    vessel_name: "Castorone",
    contractor_name: "Saipem",
    ...partial,
  };
}

describe("parseStayWindow", () => {
  it("reads a from/to range", () => {
    expect(parseStayWindow("Castorone mobilises from 1 March 2027 to 11 April 2027")).toEqual({
      arrivalAt: "2027-03-01T00:00:00.000Z",
      endsAt: "2027-04-11T00:00:00.000Z",
    });
  });

  it("applies a stated duration to a start date", () => {
    expect(parseStayWindow("start date: 1 March 2027\nThe vessel will work for 6 weeks.")).toEqual({
      arrivalAt: "2027-03-01T00:00:00.000Z",
      endsAt: "2027-04-11T00:00:00.000Z",
    });
  });

  it("reads labelled start and end dates", () => {
    expect(parseStayWindow("start date: 17 July 2026\nend date: 30 August 2026")).toEqual({
      arrivalAt: "2026-07-17T00:00:00.000Z",
      endsAt: "2026-08-30T00:00:00.000Z",
    });
  });

  it("does not invent an arrival from a duration or a publication date", () => {
    expect(parseStayWindow("Saipem awarded a Scarborough contract for 6 weeks.")).toEqual({
      arrivalAt: null,
      endsAt: null,
    });
    expect(parseStayWindow("Published on 21 September 2026.")).toEqual({
      arrivalAt: null,
      endsAt: null,
    });
  });

  it("rejects an impossible calendar day", () => {
    expect(parseStayWindow("start date: 31 February 2027")).toEqual({
      arrivalAt: null,
      endsAt: null,
    });
  });

  it("caps a stated stay at 540 days", () => {
    const window = parseStayWindow("from 1 January 2026 to 1 January 2028");
    expect(window.arrivalAt).toBe("2026-01-01T00:00:00.000Z");
    const span = (Date.parse(window.endsAt!) - Date.parse(window.arrivalAt!)) / 86_400_000;
    expect(span).toBe(539);
  });
});

describe("movementSchedule", () => {
  const observed = "2026-09-22T00:00:00.000Z";

  it("uses the fix time for an area entry", () => {
    expect(movementSchedule(observed, { type: "vessel_area_entry", etaHours: 0, confidence: 0.82 })).toEqual({
      arrivalAt: observed,
      endsAt: null,
    });
  });

  it("projects an ETA when the track reaches the geofence", () => {
    expect(
      movementSchedule(observed, { type: "vessel_course_toward", etaHours: 10, confidence: 0.68 }).arrivalAt
    ).toBe("2026-09-22T10:00:00.000Z");
  });

  it("ignores destination-only course hints and exits", () => {
    expect(movementSchedule(observed, { type: "vessel_course_toward", etaHours: 40, confidence: 0.45 })).toEqual({
      arrivalAt: null,
      endsAt: null,
    });
    expect(movementSchedule(observed, { type: "vessel_area_exit", etaHours: null, confidence: 0.7 })).toEqual({
      arrivalAt: null,
      endsAt: null,
    });
  });
});

describe("buildCalendarItems", () => {
  const now = new Date("2026-09-23T00:00:00.000Z");

  it("closes an entry with a later exit for the same vessel", () => {
    const items = buildCalendarItems(
      [
        signal({ signal_id: 1, signal_type: "vessel_area_entry" }),
        signal({
          signal_id: 2,
          signal_type: "vessel_area_exit",
          occurred_at: "2026-09-10T06:00:00.000Z",
          title: "Castorone left",
        }),
      ],
      now
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("stay");
    expect(items[0]!.label).toBe("Castorone · 10d");
    expect(day(items[0]!.start.toISOString())).toBe("2026-09-01");
    expect(day(items[0]!.end.toISOString())).toBe("2026-09-10");
    expect(items[0]!.openEnded).toBe(false);
  });

  it("marks an entry with no exit as on site and pins today after the paint window", () => {
    const recent = buildCalendarItems([signal({ signal_id: 1, signal_type: "vessel_area_entry" })], now);
    expect(recent[0]!.kind).toBe("on_site");
    expect(recent[0]!.label).toBe("Castorone · on site");
    expect(recent[0]!.pinDay).toBeNull();
    expect(itemCoversDay(recent[0]!, new Date("2026-09-23T00:00:00.000Z"))).toBe(true);

    const longStay = buildCalendarItems(
      [signal({ signal_id: 3, signal_type: "vessel_area_entry", occurred_at: "2026-01-01T00:00:00.000Z" })],
      now
    );
    expect(longStay[0]!.pinDay).not.toBeNull();
    expect(itemCoversDay(longStay[0]!, now)).toBe(true);
    expect(itemCoversDay(longStay[0]!, new Date("2026-03-01T00:00:00.000Z"))).toBe(false);
  });

  it("shows a stored inbound ETA and skips a course signal that has none", () => {
    const items = buildCalendarItems(
      [
        signal({
          signal_id: 4,
          signal_type: "vessel_course_toward",
          occurred_at: "2026-09-20T00:00:00.000Z",
          arrival_at: "2026-09-25T10:00:00.000Z",
          extract: "Course 90° at 8.0 kn reaches Carnarvon inside 72h.",
        }),
        signal({
          signal_id: 5,
          signal_type: "vessel_course_toward",
          extract: "Course 90° at 8.0 kn reaches Carnarvon inside 72h.",
        }),
      ],
      now
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("eta");
    expect(items[0]!.label).toBe("Castorone · ETA");
    expect(day(items[0]!.start.toISOString())).toBe("2026-09-25");
    expect(day(items[0]!.end.toISOString())).toBe("2026-09-25");
  });

  it("plots a news window from the text and skips a publication with no dates", () => {
    const items = buildCalendarItems(
      [
        signal({
          signal_id: 6,
          signal_type: "news",
          source_layer: "commercial",
          occurred_at: "2026-09-21T00:00:00.000Z",
          title: "Saipem awarded Scarborough work",
          extract: "Castorone will work from 1 March 2027 to 11 April 2027.",
          vessel_name: null,
          contractor_name: "Saipem",
        }),
        signal({
          signal_id: 7,
          signal_type: "award",
          source_layer: "commercial",
          title: "Saipem awarded Australia contract",
          extract: "Woodside Scarborough",
          vessel_name: null,
          contractor_name: "Saipem",
        }),
      ],
      now
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("Saipem · 42d");
    expect(day(items[0]!.start.toISOString())).toBe("2027-03-01");
    expect(day(items[0]!.end.toISOString())).toBe("2027-04-11");
  });

  it("caps an explicit stay at 180 days", () => {
    const items = buildCalendarItems(
      [
        signal({
          signal_id: 8,
          signal_type: "ep_lodged",
          source_layer: "regulatory",
          arrival_at: "2026-01-01T00:00:00.000Z",
          ends_at: "2027-01-01T00:00:00.000Z",
        }),
      ],
      now
    );
    const span =
      (Date.parse(format(items[0]!.end, "yyyy-MM-dd")) - Date.parse(format(items[0]!.start, "yyyy-MM-dd"))) / 86_400_000;
    expect(span).toBe(179);
  });

  it("lets an exit close only the entry it follows", () => {
    const items = buildCalendarItems(
      [
        signal({ signal_id: 1, signal_type: "vessel_area_entry", occurred_at: "2026-09-01T00:00:00.000Z" }),
        signal({ signal_id: 2, signal_type: "vessel_area_exit", occurred_at: "2026-09-05T00:00:00.000Z" }),
        signal({ signal_id: 3, signal_type: "vessel_area_entry", occurred_at: "2026-09-20T00:00:00.000Z" }),
      ],
      now
    );
    expect(items.map((item) => item.kind)).toEqual(["stay", "on_site"]);
    expect(items[0]!.signalId).toBe(1);
    expect(items[1]!.signalId).toBe(3);
  });
});

describe("draft schedule fields", () => {
  it("stores a NOPSEMA start date and duration", () => {
    const draft = draftFromNopsema({
      row: {
        externalId: "580",
        sourceUrl: "https://info.nopsema.gov.au/activities/580/show_public",
        title: "Echo Yodel Subsea Decommissioning",
        activityType: "Decommissioning",
        lifecycle: "Decommissioning",
        organisation: "Woodside Energy Ltd",
        project: null,
        location: "North West",
        status: "Under assessment",
        submissionDate: "17 July 2026",
        resubmissionDate: null,
      },
      detail: {
        fields: { "start date": "1 March 2027", locations: "North West" },
        summary: "Activities will be undertaken by the vessel Castorone for 6 weeks.",
        pdfLinks: [],
      },
      extraText: "",
      watch,
      sourceKey: "nopsema_ep",
      sourceLabel: "NOPSEMA EP",
      now: "2026-09-22T00:00:00.000Z",
    });
    expect(draft?.arrival_at).toBe("2027-03-01T00:00:00.000Z");
    expect(draft?.ends_at).toBe("2027-04-11T00:00:00.000Z");
  });

  it("stores a campaign window from an article and leaves an undated award empty", () => {
    const dated = draftFromArticle({
      item: {
        id: "a",
        title: "Saipem awarded Australia contract",
        url: "https://news.example/a",
        summary: "Castorone heads to Scarborough from 1 March 2027 for 6 weeks.",
        publishedAt: "2026-09-21T00:00:00.000Z",
        sourceName: "Offshore Energy",
      },
      watch,
      sourceKey: "trade_press",
      sourceLabel: "Trade press",
      now: "2026-09-22T00:00:00.000Z",
    });
    expect(dated?.arrival_at).toBe("2027-03-01T00:00:00.000Z");
    expect(dated?.ends_at).toBe("2027-04-11T00:00:00.000Z");

    const undated = draftFromArticle({
      item: {
        id: "b",
        title: "Saipem awarded Australia contract",
        url: "https://news.example/b",
        summary: "Woodside Scarborough",
        publishedAt: "2026-09-21T00:00:00.000Z",
        sourceName: "Offshore Energy",
      },
      watch,
      sourceKey: "trade_press",
      sourceLabel: "Trade press",
      now: "2026-09-22T00:00:00.000Z",
    });
    expect(undated?.arrival_at).toBeNull();
    expect(undated?.ends_at).toBeNull();
  });
});
