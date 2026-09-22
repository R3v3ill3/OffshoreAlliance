import type { EntityMatch, SignalType } from "./types";
import { clamp01, classifyRegion, looksLikeAward } from "./text";

const ACTIVITY_BOOST =
  /pipelay|pipeline|installation|decommission|survey|construction|umbilical|rock dump|dredg|subsea/i;

/**
 * Regulatory confidence. A South-East-only plan stays low so it does not
 * alert; the feed hides it unless the organiser asks for out-of-region rows.
 * Vessel names in the summary are the part organisers cannot get from the
 * title alone, so they add the most.
 */
export function regulatoryConfidence(input: {
  text: string;
  match: EntityMatch;
  signalType: SignalType;
}): { confidence: number; inRegion: boolean; regionLabel: string | null } {
  const region = classifyRegion(input.text);
  const inRegion = region !== "se";
  let score = 0.4;
  if (input.match.contractors.length || input.match.vessels.length) score += 0.15;
  if (input.match.operators.length) score += 0.1;
  if (input.match.vessels.length) score += 0.15;
  if (region === "nw" || region === "mixed") score += 0.1;
  if (ACTIVITY_BOOST.test(input.text)) score += 0.08;
  if (input.signalType === "ep_varied" || input.signalType === "activity_notification") score += 0.04;
  if (region === "se") score = Math.min(score, 0.2);
  if (!inRegion && input.match.vessels.length === 0 && input.match.contractors.length === 0) {
    score = Math.min(score, 0.15);
  }
  const regionLabel =
    region === "nw" || region === "mixed"
      ? "North-West Australia"
      : region === "se"
        ? "South-East Australia"
        : region === "other"
          ? "Australia"
          : null;
  return { confidence: clamp01(score), inRegion, regionLabel };
}

export function commercialConfidence(input: {
  text: string;
  match: EntityMatch;
  priceSensitive?: boolean;
}): { confidence: number; inRegion: boolean; signalType: SignalType; regionLabel: string | null } {
  const region = classifyRegion(input.text);
  const award = looksLikeAward(input.text);
  let score = 0.35;
  if (input.match.contractors.length || input.match.vessels.length) score += 0.15;
  if (input.match.australiaOrProject || region === "nw" || region === "other" || region === "mixed") {
    score += 0.12;
  }
  if (award) score += 0.18;
  if (input.match.operators.length) score += 0.08;
  if (input.match.vessels.length) score += 0.08;
  if (input.priceSensitive) score += 0.05;
  if (region === "se") score = Math.min(score, 0.25);
  const inRegion = region !== "se";
  return {
    confidence: clamp01(score),
    inRegion,
    signalType: award ? "award" : "news",
    regionLabel:
      region === "nw" || region === "mixed"
        ? "North-West Australia"
        : inRegion
          ? "Australia"
          : "South-East Australia",
  };
}

export function priorityRank(priority: string): number {
  switch (priority) {
    case "critical":
      return 3;
    case "high":
      return 2;
    case "normal":
      return 1;
    default:
      return 0;
  }
}

export function maxPriority(a: string, b: string): "low" | "normal" | "high" | "critical" {
  return (priorityRank(a) >= priorityRank(b) ? a : b) as "low" | "normal" | "high" | "critical";
}
