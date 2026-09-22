import { describe, expect, it } from "vitest";
import { titlesCollide } from "../dedup";
import { commercialConfidence, regulatoryConfidence } from "../confidence";
import { commercialIsRelevant, matchEntities, primaryWatchContractor } from "../match";
import { planAlerts } from "../rules";
import type { RuleRow, SignalView, Watchlist } from "../types";
import { extractVesselMentions } from "../text";
import { draftFromArticle } from "../parse/commercial";
import { draftFromNopsema, parseNopsemaListing } from "../parse/nopsema";
import { parseAsxAnnouncements } from "../parse/asx";
import { parseFeed } from "../parse/feed";
import { parseGdelt } from "../parse/news";
import { normalizeDatalasticPosition } from "../ais";
import { sectorMap } from "../pipeline/context";

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
    {
      watch_id: 2,
      canonical_name: "Subsea7",
      aliases: ["Subsea 7"],
      employer_id: 11,
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
    {
      vessel_id: 6,
      name: "Fugro Etive",
      imo: "9379686",
      owner_name: "Fugro",
      owner_operator_id: null,
      relevance: "nw",
      is_active: true,
    },
  ],
  keywords: [
    { keyword_id: 1, keyword: "Australia", kind: "region", asx_ticker: null, is_active: true },
    { keyword_id: 2, keyword: "Woodside", kind: "operator", asx_ticker: "WDS", is_active: true },
    { keyword_id: 3, keyword: "Scarborough", kind: "project", asx_ticker: null, is_active: true },
    { keyword_id: 4, keyword: "North West Shelf", kind: "region", asx_ticker: null, is_active: true },
  ],
  worksites: [{ worksite_id: 9, worksite_name: "Scarborough", operator_id: 22 }],
};

function signal(partial: Partial<SignalView> & Pick<SignalView, "signal_id" | "source_layer">): SignalView {
  return {
    signal_type: "news",
    occurred_at: "2026-09-20T00:00:00.000Z",
    detected_at: "2026-09-20T01:00:00.000Z",
    title: "t",
    confidence: 0.7,
    in_region: true,
    vessel_id: null,
    contractor_id: 10,
    watch_contractor_id: 1,
    operator_id: null,
    worksite_id: null,
    geofence_id: null,
    dedup_key: `k-${partial.signal_id}`,
    fingerprint: `f-${partial.signal_id}`,
    url: "https://example.com",
    source: "test",
    ...partial,
  };
}

const rules: RuleRow[] = [
  { rule_id: 1, code: "vessel_geofence", name: "Vessel", enabled: true, priority: "high", config: { minConfidence: 0.55 } },
  { rule_id: 2, code: "regulatory_watch", name: "NOPSEMA", enabled: true, priority: "normal", config: { minConfidence: 0.5 } },
  { rule_id: 3, code: "commercial_watch", name: "News", enabled: true, priority: "normal", config: { minConfidence: 0.55 } },
  {
    rule_id: 4,
    code: "imminent_mobilisation",
    name: "Imminent",
    enabled: true,
    priority: "critical",
    config: { windowDays: 42, minLayers: 2, minConfidence: 0.6 },
  },
];

describe("match and confidence", () => {
  it("matches a contractor plus Australia and treats an award as commercial", () => {
    const text = "Saipem awarded the Scarborough pipelay contract offshore Australia for Woodside";
    const match = matchEntities(text, watch);
    expect(match.contractors.map((c) => c.canonical_name)).toEqual(["Saipem"]);
    expect(match.projects.map((p) => p.keyword)).toEqual(["Scarborough"]);
    expect(commercialIsRelevant(match)).toBe(true);
    const scored = commercialConfidence({ text, match });
    expect(scored.signalType).toBe("award");
    expect(scored.confidence).toBeGreaterThan(0.55);
    expect(primaryWatchContractor(match, watch)?.watch_id).toBe(1);
  });

  it("ignores a North Sea story with no Australian term", () => {
    const match = matchEntities("Saipem wins North Sea campaign", watch);
    expect(commercialIsRelevant(match)).toBe(false);
  });

  it("keeps a Bass Strait plan below the alert line", () => {
    const text = "Saipem variation, Bass Strait, Gippsland";
    const match = matchEntities(text, watch);
    const scored = regulatoryConfidence({ text, match, signalType: "ep_varied" });
    expect(scored.inRegion).toBe(false);
    expect(scored.confidence).toBeLessThan(0.5);
  });

  it("reads an IMO and a vessel name out of EP text", () => {
    const mentions = extractVesselMentions(
      "The survey will be undertaken by the vessel Fugro Etive (IMO 9379686) supported by Castorone.",
      watch.vessels
    );
    expect(mentions.map((m) => m.name).sort()).toEqual(["Castorone", "Fugro Etive"]);
    expect(mentions.find((m) => m.name === "Fugro Etive")?.imo).toBe("9379686");
  });

  it("collapses the same headline from two outlets", () => {
    expect(
      titlesCollide(
        "Saipem awarded Scarborough pipelay contract",
        "Saipem awarded the Scarborough pipelay contract by Woodside"
      )
    ).toBe(true);
  });
});

describe("parsers", () => {
  it("reads an under-assessment table by its header", () => {
    const html = `<table><thead><tr>
      <th>Location(s)</th><th>Activity type</th><th>Activity name</th>
      <th>Lifecycle classification</th><th>Submitted by</th><th>Submission date</th>
      <th>Resubmission date</th><th>Status</th><th></th>
    </tr></thead><tbody><tr>
      <td>North West</td><td>Decommissioning</td><td>Echo Yodel Subsea Decommissioning</td>
      <td>Decommissioning</td><td>Woodside Energy Ltd</td><td>17-07-2026</td><td></td>
      <td>Under assessment</td><td><a href="/activities/580/show_public">View</a></td>
    </tr></tbody></table>`;
    const { rows } = parseNopsemaListing(html, "https://info.nopsema.gov.au/home/under_assessment_petroleum");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Echo Yodel Subsea Decommissioning");
    expect(rows[0]!.organisation).toBe("Woodside Energy Ltd");
    expect(rows[0]!.location).toBe("North West");
    expect(rows[0]!.externalId).toBe("580");
  });

  it("builds a regulatory signal when the summary names a watchlist vessel", () => {
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
        fields: { organisation: "Woodside Energy Ltd", locations: "North West" },
        summary: "Activities will be undertaken by the vessel Castorone.",
        pdfLinks: [],
      },
      extraText: "",
      watch,
      sourceKey: "nopsema_ep",
      sourceLabel: "NOPSEMA EP",
      now: "2026-09-22T00:00:00.000Z",
    });
    expect(draft?.vessel_id).toBe(5);
    expect(draft?.in_region).toBe(true);
    expect(draft?.signal_type).toBe("ep_lodged");
    expect(draft?.worksite_id).toBeNull();
  });

  it("parses RSS, ASX JSON, GDELT and a Datalastic position", () => {
    const feed = parseFeed(
      `<?xml version="1.0"?><rss><channel><item><title>Saipem awarded Australia contract</title><link>https://news.example/a</link><guid>a</guid><pubDate>Mon, 21 Sep 2026 00:00:00 GMT</pubDate><description>Woodside Scarborough</description></item></channel></rss>`,
      "Offshore Energy"
    );
    expect(feed[0]!.title).toContain("Saipem");
    const article = draftFromArticle({
      item: feed[0]!,
      watch,
      sourceKey: "trade_press",
      sourceLabel: "Trade press",
      now: "2026-09-22T00:00:00.000Z",
    });
    expect(article?.signal_type).toBe("award");
    expect(article?.watch_contractor_id).toBe(1);

    const asx = parseAsxAnnouncements(
      { data: { items: [{ headline: "Contract award", documentKey: "abc", priceSensitive: true, date: "2026-09-21T00:00:00Z" }] } },
      "WDS"
    );
    expect(asx[0]!.priceSensitive).toBe(true);
    expect(asx[0]!.url).toContain("abc");

    const gdelt = parseGdelt({
      articles: [{ title: "Saipem Australia", url: "https://g.example/1", seendate: "20260921T000000Z", domain: "example.com" }],
    });
    expect(gdelt[0]!.publishedAt).toBe("2026-09-21T00:00:00.000Z");

    const pos = normalizeDatalasticPosition(
      { data: { imo: "9379686", name: "FUGRO ETIVE", lat: -20.1, lon: 115.2, speed: 8, course: 90, destination: "DAMPIER", last_position_UTC: "2026-09-22T01:00:00Z" } },
      "datalastic"
    );
    expect(pos?.imo).toBe("9379686");
    expect(pos?.lng).toBe(115.2);
    expect(pos?.sogKn).toBe(8);
  });
});

describe("planAlerts", () => {
  it("opens a regulatory alert and an imminent alert when a second layer is already in the window", () => {
    const ep = signal({
      signal_id: 2,
      source_layer: "regulatory",
      signal_type: "ep_lodged",
      title: "EP names Castorone",
      confidence: 0.72,
      occurred_at: "2026-09-22T00:00:00.000Z",
    });
    const award = signal({
      signal_id: 1,
      source_layer: "commercial",
      signal_type: "award",
      occurred_at: "2026-09-01T00:00:00.000Z",
    });
    const plan = planAlerts({
      rules,
      signal: ep,
      recent: [award],
      existingAlerts: [],
      now: "2026-09-22T00:00:00.000Z",
    });
    expect(plan.create.map((a) => a.rule_code).sort()).toEqual(["imminent_mobilisation", "regulatory_watch"]);
    const imminent = plan.create.find((a) => a.rule_code === "imminent_mobilisation")!;
    expect(imminent.priority).toBe("critical");
    expect(imminent.signal_ids.sort()).toEqual([1, 2]);
  });

  it("does not re-open a dismissed dedup key", () => {
    const ais = signal({
      signal_id: 3,
      source_layer: "ais",
      signal_type: "vessel_area_entry",
      vessel_id: 5,
      confidence: 0.82,
      dedup_key: "ais",
    });
    const plan = planAlerts({
      rules,
      signal: ais,
      recent: [],
      existingAlerts: [
        {
          alert_id: 9,
          dedup_key: `vessel_geofence:vessel:5:2026-09-20`,
          status: "dismissed",
          dismissed_at: "2026-09-20T02:00:00.000Z",
          priority: "high",
        },
      ],
      now: "2026-09-20T03:00:00.000Z",
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.attach).toHaveLength(0);
  });

  it("attaches a repeat to an open alert instead of firing again", () => {
    const ais = signal({
      signal_id: 4,
      source_layer: "ais",
      signal_type: "vessel_course_toward",
      vessel_id: 5,
      confidence: 0.7,
      occurred_at: "2026-09-20T00:00:00.000Z",
    });
    const plan = planAlerts({
      rules,
      signal: ais,
      recent: [],
      existingAlerts: [
        {
          alert_id: 4,
          dedup_key: "vessel_geofence:vessel:5:2026-09-20",
          status: "snoozed",
          dismissed_at: null,
          priority: "high",
        },
      ],
      now: "2026-09-20T00:00:00.000Z",
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.attach).toEqual([{ alert_id: 4, signal_id: 4 }]);
  });
});

describe("sectorMap", () => {
  const sectors = [
    { sector_id: 1, sector_name: "Construction" },
    { sector_id: 2, sector_name: "Offshore oil and gas" },
  ];

  it("uses the only sector, or the offshore one when an employer spans several", () => {
    const map = sectorMap(sectors, [
      { employer_id: 10, sector_id: 1 },
      { employer_id: 11, sector_id: 1 },
      { employer_id: 11, sector_id: 2 },
    ]);
    expect(map.get(10)).toBe(1);
    expect(map.get(11)).toBe(2);
    expect(map.has(12)).toBe(false);
  });
});
