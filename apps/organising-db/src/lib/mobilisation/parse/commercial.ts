import { commercialConfidence } from "../confidence";
import { commercialDedup, commercialFingerprint } from "../dedup";
import {
  commercialIsRelevant,
  matchEntities,
  matchedTerms,
  matchWorksite,
  primaryContractorId,
  primaryVesselId,
  primaryWatchContractor,
} from "../match";
import type { SignalDraft, Watchlist } from "../types";
import { looksLikeAward } from "../text";
import type { AsxAnnouncement } from "./asx";
import type { FeedItem } from "./feed";

export function draftFromArticle(input: {
  item: FeedItem;
  watch: Watchlist;
  sourceKey: string;
  sourceLabel: string;
  now: string;
}): SignalDraft | null {
  const text = `${input.item.title}\n${input.item.summary ?? ""}`;
  const match = matchEntities(text, input.watch);
  if (!commercialIsRelevant(match)) return null;
  const scored = commercialConfidence({ text, match });
  const watchContractor = primaryWatchContractor(match, input.watch);
  const contractorKey = watchContractor
    ? `watch:${watchContractor.watch_id}`
    : `vessel:${primaryVesselId(match) ?? "x"}`;
  const occurred = input.item.publishedAt ?? input.now;
  const worksite = matchWorksite(text, input.watch.worksites);
  const externalId = input.item.id.slice(0, 300);
  return {
    source_layer: "commercial",
    source: input.item.sourceName || input.sourceLabel,
    source_key: input.sourceKey,
    signal_type: scored.signalType,
    occurred_at: occurred,
    title: input.item.title.slice(0, 300),
    extract: input.item.summary,
    url: input.item.url,
    confidence: scored.confidence,
    in_region: scored.inRegion,
    vessel_id: primaryVesselId(match),
    contractor_id: primaryContractorId(match) ?? watchContractor?.employer_id ?? null,
    watch_contractor_id: watchContractor?.watch_id ?? null,
    operator_id: worksite?.operator_id ?? null,
    worksite_id: worksite?.worksite_id ?? null,
    geofence_id: null,
    sector_id: null,
    dedup_key: commercialDedup(input.sourceKey, externalId),
    fingerprint: commercialFingerprint(contractorKey, occurred, input.item.title),
    external_id: externalId,
    matched_terms: matchedTerms(match),
    region_label: scored.regionLabel,
  };
}

export function draftFromAsx(input: {
  item: AsxAnnouncement;
  watch: Watchlist;
  now: string;
  /** Display name for the ticker, e.g. Woodside. */
  subjectName: string;
}): SignalDraft | null {
  const text = `${input.item.headline} ${input.subjectName} ${input.item.ticker}`;
  if (!looksLikeAward(input.item.headline) && !/vessel|mobilis|pipelay|campaign|offshore|project|contract/i.test(input.item.headline)) {
    return null;
  }
  const match = matchEntities(`${text} Australia`, input.watch);
  // The ticker's own company is the subject even when the headline omits it.
  const forced = match.contractors.length
    ? match
    : {
        ...match,
        australiaOrProject: true,
      };
  const scored = commercialConfidence({
    text: `${input.item.headline} Australia ${input.subjectName}`,
    match: forced,
    priceSensitive: input.item.priceSensitive,
  });
  const watchContractor =
    primaryWatchContractor(match, input.watch) ??
    input.watch.contractors.find(
      (c) => c.asx_ticker?.toUpperCase() === input.item.ticker.toUpperCase()
    ) ??
    null;
  const operatorKeyword = input.watch.keywords.find(
    (k) => k.kind === "operator" && k.asx_ticker?.toUpperCase() === input.item.ticker.toUpperCase()
  );
  const occurred = input.item.publishedAt ?? input.now;
  const contractorKey = watchContractor
    ? `watch:${watchContractor.watch_id}`
    : `ticker:${input.item.ticker}`;
  return {
    source_layer: "commercial",
    source: "ASX",
    source_key: "asx",
    signal_type: scored.signalType,
    occurred_at: occurred,
    title: `${input.item.ticker}: ${input.item.headline}`.slice(0, 300),
    extract: input.item.priceSensitive ? "Market-sensitive ASX announcement." : "ASX announcement.",
    url: input.item.url,
    confidence: scored.confidence,
    in_region: scored.inRegion,
    vessel_id: primaryVesselId(match),
    contractor_id: watchContractor?.employer_id ?? null,
    watch_contractor_id: watchContractor?.watch_id ?? null,
    operator_id: null,
    worksite_id: null,
    geofence_id: null,
    sector_id: null,
    dedup_key: commercialDedup("asx", `${input.item.ticker}:${input.item.id}`),
    fingerprint: commercialFingerprint(contractorKey, occurred, input.item.headline),
    external_id: input.item.id,
    matched_terms: [
      ...matchedTerms(match),
      input.subjectName,
      ...(operatorKeyword ? [operatorKeyword.keyword] : []),
    ].filter((v, i, a) => a.indexOf(v) === i),
    region_label: scored.regionLabel,
  };
}
