export * from "./generated"

import type { Tables, TablesInsert, TablesUpdate } from "./generated"

/** Row / insert / update types for public.member_endorsement_votes (app-level names). */
export type MemberEndorsementVote = Tables<"member_endorsement_votes">
export type MemberEndorsementVoteInsert = TablesInsert<"member_endorsement_votes">
export type MemberEndorsementVoteUpdate = TablesUpdate<"member_endorsement_votes">

/** Row type for public.v_bargaining_progress view. */
export type VBargainingProgress = Tables<"v_bargaining_progress">
