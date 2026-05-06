import { nopsemaAdapter } from "./nopsema";
import type { SourceAdapter } from "./types";

export const adapters: SourceAdapter[] = [nopsemaAdapter];

export type { SourceAdapter, NormalisedUpcomingProject } from "./types";
