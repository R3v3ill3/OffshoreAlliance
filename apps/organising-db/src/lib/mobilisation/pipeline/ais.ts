import { createAisProvider, readAisEnv } from "../ais";
import {
  collectAisStream,
  listenBoxes,
  listenSeconds,
  matchStreamVessel,
  readAisStreamKey,
  type AisStreamHit,
  type StreamVessel,
} from "../aisstream";
import type { AisPosition } from "../types";
import { aisDedup, aisFingerprint } from "../dedup";
import { classifyMovement, nextPollMinutes } from "../movement";
import { distanceToGeometryNm } from "../geo";
import { primaryWatchContractor } from "../match";
import type { EntityMatch, SignalDraft, WatchVessel } from "../types";
import type { Db } from "./context";
import { loadSource, markSource, recordAndAlert, sourceDue, type RadarContext } from "./context";

const RETENTION_DAYS = 14;

export async function pollAis(db: Db, ctx: RadarContext, force = false): Promise<string[]> {
  const source = await loadSource(db, "ais");
  if (!source || !sourceDue(source, force)) return ["ais skipped (cadence)"];
  const streamKey = readAisStreamKey();
  if (streamKey) return pollAisStream(db, ctx, streamKey);

  const env = readAisEnv();
  const provider = createAisProvider({ ...env, satellite: ctx.satellite || env.satellite });
  if (!provider) {
    const reason = env.apiKey
      ? `AIS provider "${env.provider}" is not implemented. MVP uses datalastic.`
      : "AIS skipped (set AISSTREAM_API_KEY). Watchlist and the other layers still run.";
    await markSource(db, "ais", { ok: !env.apiKey, error: env.apiKey ? reason : null });
    return [reason];
  }

  const { data: vesselRows, error } = await db
    .from("vessels")
    .select("vessel_id, name, imo, mmsi, owner_name, owner_operator_id, relevance, is_active, inside_geofence_ids, next_poll_at, resolution_note")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const watched = new Set(
    ctx.watch.vessels.filter((v) => v.is_active).map((v) => v.vessel_id)
  );
  const now = new Date();
  const drafts: SignalDraft[] = [];
  const errors: string[] = [];
  let fetched = 0;

  for (const row of vesselRows ?? []) {
    const vessel = row as {
      vessel_id: number;
      name: string;
      imo: string | null;
      owner_name: string;
      owner_operator_id: number | null;
      relevance: WatchVessel["relevance"];
      inside_geofence_ids: number[] | null;
      next_poll_at: string | null;
      resolution_note: string | null;
    };
    if (!watched.has(vessel.vessel_id)) continue;
    if (!force && vessel.next_poll_at && new Date(vessel.next_poll_at).getTime() > now.getTime()) continue;
    if (/spread|fleet/i.test(vessel.name) && !vessel.imo) continue;

    let imo = vessel.imo;
    if (!imo) {
      try {
        const found = await provider.searchByName(vessel.name);
        const exact = found.find((item) => item.name.toLowerCase() === vessel.name.toLowerCase() && item.imo);
        imo = cleanImo(exact?.imo ?? null);
        await db
          .from("vessels")
          .update({
            imo,
            mmsi: exact?.mmsi ?? null,
            resolution_note: imo ? `Resolved via ${provider.id} name search.` : `No exact IMO match for "${vessel.name}" yet.`,
            next_poll_at: new Date(now.getTime() + (imo ? 0 : 24 * 3600_000)).toISOString(),
          })
          .eq("vessel_id", vessel.vessel_id);
        if (!imo) continue;
      } catch (err) {
        errors.push(`${vessel.name}: ${err instanceof Error ? err.message : "name search failed"}`);
        continue;
      }
    }

    let position: AisPosition | null = null;
    try {
      position = await provider.positionByImo(imo);
      fetched += 1;
    } catch (err) {
      errors.push(`${vessel.name}: ${err instanceof Error ? err.message : "position failed"}`);
      continue;
    }
    if (!position) {
      await db
        .from("vessels")
        .update({
          resolution_note: "No position returned.",
          next_poll_at: new Date(now.getTime() + 6 * 3600_000).toISOString(),
        })
        .eq("vessel_id", vessel.vessel_id);
      continue;
    }

    const movement = classifyMovement(
      {
        position: { lng: position.lng, lat: position.lat },
        cogDeg: position.cogDeg,
        sogKn: position.sogKn,
        destination: position.destination,
        previouslyInside: vessel.inside_geofence_ids ?? [],
        satellite: provider.satellite,
      },
      ctx.geofences
    );
    const distance = ctx.geofences.reduce((min, fence) => {
      return Math.min(min, distanceToGeometryNm({ lng: position!.lng, lat: position!.lat }, fence.geometry));
    }, Infinity);
    const waitMin = nextPollMinutes(Number.isFinite(distance) ? distance : 9_999, provider.satellite);

    await db.from("mobilisation_positions").insert({
      vessel_id: vessel.vessel_id,
      observed_at: position.observedAt,
      latitude: position.lat,
      longitude: position.lng,
      sog_kn: position.sogKn,
      cog_deg: position.cogDeg,
      destination: position.destination,
      eta: position.eta,
      source: position.source,
    });
    await db
      .from("vessels")
      .update({
        imo,
        mmsi: position.mmsi,
        last_lat: position.lat,
        last_lng: position.lng,
        last_sog_kn: position.sogKn,
        last_cog_deg: position.cogDeg,
        last_destination: position.destination,
        last_eta: position.eta,
        last_position_at: position.observedAt,
        last_position_source: position.source,
        inside_geofence_ids: movement.insideIds,
        next_poll_at: new Date(now.getTime() + waitMin * 60_000).toISOString(),
        resolution_note: null,
      })
      .eq("vessel_id", vessel.vessel_id);

    const watchVessel: WatchVessel = {
      vessel_id: vessel.vessel_id,
      name: vessel.name,
      imo,
      owner_name: vessel.owner_name,
      owner_operator_id: vessel.owner_operator_id,
      relevance: vessel.relevance,
      is_active: true,
    };
    const match: EntityMatch = {
      contractors: [],
      vessels: [watchVessel],
      operators: [],
      regions: [],
      projects: [],
      australiaOrProject: false,
      sevenFleet: false,
    };
    const contractor = primaryWatchContractor(match, ctx.watch);
    for (const event of movement.events) {
      // Global-awareness hulls still record an entry if they actually cross
      // an NW geofence. Low-relevance PLSVs do not raise course alerts.
      if (vessel.relevance === "low" && event.type !== "vessel_area_entry") continue;
      const kind = event.type === "vessel_area_entry" ? "entry" : event.type === "vessel_area_exit" ? "exit" : "inbound";
      drafts.push({
        source_layer: "ais",
        source: `${provider.id} area`,
        source_key: "ais",
        signal_type: event.type,
        occurred_at: position.observedAt,
        title: `${vessel.name} — ${event.geofence_name}`,
        extract: event.reason,
        url: null,
        confidence: event.confidence,
        in_region: true,
        vessel_id: vessel.vessel_id,
        contractor_id: contractor?.employer_id ?? vessel.owner_operator_id,
        watch_contractor_id: contractor?.watch_id ?? null,
        operator_id: null,
        worksite_id: null,
        geofence_id: event.geofence_id,
        sector_id: null,
        dedup_key: aisDedup(kind, imo, event.geofence_id, position.observedAt),
        fingerprint: aisFingerprint(kind, imo, event.geofence_id, position.observedAt),
        external_id: imo,
        matched_terms: [vessel.name, contractor?.canonical_name].filter((v): v is string => Boolean(v)),
        region_label: event.geofence_name,
      });
    }
  }

  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86400000).toISOString();
  await db.from("mobilisation_positions").delete().lt("created_at", cutoff);
  const saved = await recordAndAlert(db, ctx, drafts, now.toISOString());
  await markSource(db, "ais", {
    ok: errors.length === 0,
    error: errors.slice(0, 8).join("; ") || null,
  });
  return [
    `ais fetched ${fetched}, created ${saved.created}, alerts ${saved.alerts.length}`,
    ...errors.slice(0, 8),
  ];
}

function cleanImo(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return /^\d{7}$/.test(digits) ? digits : null;
}

async function pollAisStream(db: Db, ctx: RadarContext, apiKey: string): Promise<string[]> {
  const seconds = listenSeconds();
  const boxes = listenBoxes(ctx.geofences);
  const { data: vesselRows, error } = await db
    .from("vessels")
    .select("vessel_id, name, imo, mmsi, owner_name, owner_operator_id, relevance, is_active, inside_geofence_ids")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const watched = new Set(ctx.watch.vessels.filter((vessel) => vessel.is_active).map((vessel) => vessel.vessel_id));
  const vessels = (vesselRows ?? [])
    .map((row) => row as StreamVessel & {
      owner_name: string;
      owner_operator_id: number | null;
      relevance: WatchVessel["relevance"];
      inside_geofence_ids: number[] | null;
    })
    .filter((vessel) => watched.has(vessel.vessel_id));

  let listen;
  try {
    listen = await collectAisStream({ apiKey, boxes, listenMs: seconds * 1000 });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "AISStream failed";
    await markSource(db, "ais", { ok: false, error: reason });
    return [reason];
  }
  if (!listen.confirmed) {
    const reason = listen.error || "AISStream did not confirm the subscription. Check AISSTREAM_API_KEY.";
    await markSource(db, "ais", { ok: false, error: reason });
    return [reason];
  }

  const now = new Date();
  const latest = new Map<number, { hit: AisStreamHit; vessel: (typeof vessels)[number] }>();
  let matched = 0;
  for (const hit of listen.hits) {
    const vessel = matchStreamVessel(vessels, hit);
    if (!vessel) continue;
    matched += 1;
    const row = vessels.find((item) => item.vessel_id === vessel.vessel_id);
    if (!row) continue;
    if (hit.mmsi && !row.mmsi) row.mmsi = hit.mmsi;
    if (hit.imo && !row.imo) row.imo = hit.imo;
    if (hit.lat == null || hit.lng == null) continue;
    const previous = latest.get(row.vessel_id);
    if (!previous || previous.hit.observedAt <= hit.observedAt) {
      latest.set(row.vessel_id, { hit, vessel: row });
    }
  }

  const drafts: SignalDraft[] = [];
  for (const { hit, vessel } of latest.values()) {
    const position = {
      lng: hit.lng!,
      lat: hit.lat!,
      cogDeg: hit.cogDeg,
      sogKn: hit.sogKn,
      destination: hit.destination,
      observedAt: hit.observedAt,
      mmsi: hit.mmsi ?? vessel.mmsi,
      imo: hit.imo ?? vessel.imo,
    };
    const movement = classifyMovement(
      {
        position: { lng: position.lng, lat: position.lat },
        cogDeg: position.cogDeg,
        sogKn: position.sogKn,
        destination: position.destination,
        previouslyInside: vessel.inside_geofence_ids ?? [],
        satellite: false,
      },
      ctx.geofences
    );
    await db.from("mobilisation_positions").insert({
      vessel_id: vessel.vessel_id,
      observed_at: position.observedAt,
      latitude: position.lat,
      longitude: position.lng,
      sog_kn: position.sogKn,
      cog_deg: position.cogDeg,
      destination: position.destination,
      source: "aisstream",
    });
    await db
      .from("vessels")
      .update({
        imo: position.imo,
        mmsi: position.mmsi,
        last_lat: position.lat,
        last_lng: position.lng,
        last_sog_kn: position.sogKn,
        last_cog_deg: position.cogDeg,
        last_destination: position.destination,
        last_position_at: position.observedAt,
        last_position_source: "aisstream",
        inside_geofence_ids: movement.insideIds,
        resolution_note: "Position from AISStream while the vessel was in terrestrial range.",
      })
      .eq("vessel_id", vessel.vessel_id);

    const watchVessel: WatchVessel = {
      vessel_id: vessel.vessel_id,
      name: vessel.name,
      imo: position.imo,
      owner_name: vessel.owner_name,
      owner_operator_id: vessel.owner_operator_id,
      relevance: vessel.relevance,
      is_active: true,
    };
    const contractor = primaryWatchContractor(
      {
        contractors: [],
        vessels: [watchVessel],
        operators: [],
        regions: [],
        projects: [],
        australiaOrProject: false,
        sevenFleet: false,
      },
      ctx.watch
    );
    const id = position.imo || position.mmsi || String(vessel.vessel_id);
    for (const event of movement.events) {
      if (vessel.relevance === "low" && event.type !== "vessel_area_entry") continue;
      const kind = event.type === "vessel_area_entry" ? "entry" : event.type === "vessel_area_exit" ? "exit" : "inbound";
      drafts.push({
        source_layer: "ais",
        source: "AISStream area",
        source_key: "ais",
        signal_type: event.type,
        occurred_at: position.observedAt,
        title: `${vessel.name} — ${event.geofence_name}`,
        extract: event.reason,
        url: null,
        confidence: event.confidence,
        in_region: true,
        vessel_id: vessel.vessel_id,
        contractor_id: contractor?.employer_id ?? vessel.owner_operator_id,
        watch_contractor_id: contractor?.watch_id ?? null,
        operator_id: null,
        worksite_id: null,
        geofence_id: event.geofence_id,
        sector_id: null,
        dedup_key: aisDedup(kind, id, event.geofence_id, position.observedAt),
        fingerprint: aisFingerprint(kind, id, event.geofence_id, position.observedAt),
        external_id: id,
        matched_terms: [vessel.name, contractor?.canonical_name].filter((value): value is string => Boolean(value)),
        region_label: event.geofence_name,
      });
    }
  }

  const learned = vessels.filter((vessel) => vessel.mmsi || vessel.imo);
  for (const vessel of learned) {
    if (latest.has(vessel.vessel_id)) continue;
    const original = (vesselRows ?? []).find((row) => (row as { vessel_id: number }).vessel_id === vessel.vessel_id) as
      | { imo: string | null; mmsi: string | null }
      | undefined;
    if (original && original.imo === vessel.imo && original.mmsi === vessel.mmsi) continue;
    await db
      .from("vessels")
      .update({
        imo: vessel.imo,
        mmsi: vessel.mmsi,
        resolution_note: "Identity learned from AISStream. No position in this listen window.",
      })
      .eq("vessel_id", vessel.vessel_id);
  }

  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86400000).toISOString();
  await db.from("mobilisation_positions").delete().lt("created_at", cutoff);
  const saved = await recordAndAlert(db, ctx, drafts, now.toISOString());
  await markSource(db, "ais", { ok: true, error: listen.error });
  return [
    `aisstream listened ${seconds}s, messages ${listen.messages}, watchlist hits ${matched}, positions ${latest.size}, alerts ${saved.alerts.length}`,
  ];
}
