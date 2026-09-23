import { describe, expect, it } from "vitest";
import { listenBoxes, matchStreamVessel, parseAisStreamMessage } from "../aisstream";
import { DEFAULT_GEOFENCES } from "../geofences";

const vessels = [
  { vessel_id: 1, name: "Fugro Etive", imo: "9379686", mmsi: null },
  { vessel_id: 2, name: "Castorone", imo: null, mmsi: "247232700" },
  { vessel_id: 3, name: "Van Oord dredger spread", imo: null, mmsi: null },
];

describe("parseAisStreamMessage", () => {
  it("reads a position report and a padded static name", () => {
    const position = parseAisStreamMessage(
      {
        MessageType: "PositionReport",
        MetaData: { MMSI: 247232700, ShipName: "CASTORONE", time_utc: "2026-09-23 01:02:03.123456789 +0000 UTC" },
        Message: { PositionReport: { UserID: 247232700, Latitude: -20.2, Longitude: 115.4, Sog: 11.2, Cog: 90, TrueHeading: 511, Valid: true } },
      },
      "2026-09-23T00:00:00.000Z"
    );
    expect(position).toMatchObject({
      kind: "position",
      mmsi: "247232700",
      lat: -20.2,
      lng: 115.4,
      sogKn: 11.2,
      cogDeg: 90,
      observedAt: "2026-09-23T01:02:03.123Z",
    });

    const stat = parseAisStreamMessage(
      {
        MessageType: "ShipStaticData",
        MetaData: { MMSI: 311000123, ShipName: "FUGRO ETIVE" },
        Message: { ShipStaticData: { UserID: 311000123, ImoNumber: 9379686, Name: "FUGRO ETIVE@@@@", Valid: true } },
      },
      "2026-09-23T00:00:00.000Z"
    );
    expect(stat).toMatchObject({ kind: "static", imo: "9379686", name: "FUGRO ETIVE", mmsi: "311000123" });
  });

  it("drops unavailable coordinates and the subscription confirmation", () => {
    expect(
      parseAisStreamMessage(
        { MessageType: "PositionReport", Message: { PositionReport: { Latitude: 91, Longitude: 181, UserID: 123456789 } } },
        "2026-09-23T00:00:00.000Z"
      )?.lat
    ).toBeNull();
    expect(parseAisStreamMessage({ MessageType: "SubscriptionConfirmation", Message: {} }, "2026-09-23T00:00:00.000Z")).toBeNull();
  });
});

describe("matchStreamVessel", () => {
  it("matches MMSI, then IMO, then a unique name", () => {
    expect(matchStreamVessel(vessels, hit({ mmsi: "247232700" }))?.vessel_id).toBe(2);
    expect(matchStreamVessel(vessels, hit({ imo: "9379686", name: "FUGRO ETIVE" }))?.vessel_id).toBe(1);
    expect(matchStreamVessel(vessels, hit({ name: "Fugro Etive" }))?.vessel_id).toBe(1);
    expect(matchStreamVessel(vessels, hit({ name: "Van Oord dredger spread" }))).toBeNull();
  });
});

describe("listenBoxes", () => {
  it("covers the seeded North-West polygons with padding", () => {
    const [box] = listenBoxes(DEFAULT_GEOFENCES.map((fence) => ({ geometry: fence.geometry, is_active: true })));
    const [northWest, southEast] = box!;
    expect(northWest![0]).toBeGreaterThan(-9);
    expect(southEast![0]).toBeLessThan(-23);
    expect(northWest![1]).toBeLessThan(112);
    expect(southEast![1]).toBeGreaterThan(132);
  });
});

function hit(partial: { mmsi?: string; imo?: string; name?: string }) {
  return {
    kind: "position" as const,
    mmsi: partial.mmsi ?? null,
    imo: partial.imo ?? null,
    name: partial.name ?? null,
    lat: -20,
    lng: 115,
    sogKn: 10,
    cogDeg: 90,
    destination: null,
    observedAt: "2026-09-23T00:00:00.000Z",
  };
}
