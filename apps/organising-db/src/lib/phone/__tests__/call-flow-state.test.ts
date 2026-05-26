import { describe, it, expect } from "vitest";
import {
  callFlowReducer,
  canAdvanceSection,
  canGoBack,
  getInitialCallFlowState,
  isCallActive,
  type CapturedIssue,
  type CapturedObjection,
} from "@/lib/phone/call-flow-state";

const baseObjection: CapturedObjection = {
  objection_id: 42,
  outcome: "fully_resolved",
};

const baseIssue: CapturedIssue = {
  issue_label: "Pay",
  heat: 4,
};

describe("callFlowReducer", () => {
  it("initialises in the idle phase", () => {
    const state = getInitialCallFlowState();
    expect(state.phase).toBe("idle");
    expect(state.currentSectionIndex).toBe(0);
    expect(state.dialDisposition).toBeNull();
    expect(state.callDisposition).toBeNull();
    expect(state.capturedObjections).toEqual([]);
    expect(state.capturedIssues).toEqual([]);
  });

  it("moves through the happy path: load → pre_call → dialing → connected → in_script", () => {
    let state = getInitialCallFlowState();
    state = callFlowReducer(state, { type: "LOAD_CONTACT" });
    expect(state.phase).toBe("loading_contact");
    state = callFlowReducer(state, { type: "CONTACT_LOADED" });
    expect(state.phase).toBe("pre_call");
    state = callFlowReducer(state, { type: "START_DIAL" });
    expect(state.phase).toBe("dialing");
    expect(state.callStartedAt).toBeInstanceOf(Date);
    state = callFlowReducer(state, { type: "DIAL_OUTCOME", disposition: "connected" });
    expect(state.phase).toBe("connected");
    expect(state.dialDisposition).toBe("connected");
    state = callFlowReducer(state, { type: "ADVANCE_SECTION" });
    expect(state.phase).toBe("in_script");
    expect(state.currentSectionIndex).toBe(1);
  });

  it("routes non-connected dial outcomes to the not_reached phase", () => {
    let state = callFlowReducer(getInitialCallFlowState(), { type: "START_DIAL" });
    state = callFlowReducer(state, { type: "DIAL_OUTCOME", disposition: "no_answer" });
    expect(state.phase).toBe("not_reached");
    expect(state.dialDisposition).toBe("no_answer");
  });

  it("records call disposition without losing dial disposition", () => {
    let state = getInitialCallFlowState();
    state = callFlowReducer(state, { type: "START_DIAL" });
    state = callFlowReducer(state, { type: "DIAL_OUTCOME", disposition: "connected" });
    state = callFlowReducer(state, { type: "COMPLETE_CALL", disposition: "completed_positive" });
    expect(state.phase).toBe("call_complete");
    expect(state.callDisposition).toBe("completed_positive");
    expect(state.dialDisposition).toBe("connected");
  });

  it("RESET clears any captured data", () => {
    let state = getInitialCallFlowState();
    state = callFlowReducer(state, { type: "ADD_OBJECTION", objection: baseObjection });
    state = callFlowReducer(state, { type: "ADD_ISSUE", issue: baseIssue });
    expect(state.capturedObjections).toHaveLength(1);
    expect(state.capturedIssues).toHaveLength(1);

    state = callFlowReducer(state, { type: "RESET" });
    expect(state.phase).toBe("idle");
    expect(state.capturedObjections).toEqual([]);
    expect(state.capturedIssues).toEqual([]);
  });

  it("ADD / UPDATE / REMOVE_OBJECTION preserves immutability", () => {
    let state = getInitialCallFlowState();
    const initial = state;
    state = callFlowReducer(state, { type: "ADD_OBJECTION", objection: baseObjection });
    expect(initial.capturedObjections).toEqual([]); // original untouched
    expect(state.capturedObjections).toEqual([baseObjection]);

    state = callFlowReducer(state, {
      type: "UPDATE_OBJECTION",
      index: 0,
      objection: { ...baseObjection, outcome: "partially_resolved" },
    });
    expect(state.capturedObjections[0]?.outcome).toBe("partially_resolved");

    state = callFlowReducer(state, { type: "REMOVE_OBJECTION", index: 0 });
    expect(state.capturedObjections).toEqual([]);
  });

  it("ADD / UPDATE / REMOVE_ISSUE preserves immutability", () => {
    let state = getInitialCallFlowState();
    state = callFlowReducer(state, { type: "ADD_ISSUE", issue: baseIssue });
    state = callFlowReducer(state, {
      type: "UPDATE_ISSUE",
      index: 0,
      issue: { ...baseIssue, heat: 5 },
    });
    expect(state.capturedIssues[0]?.heat).toBe(5);
    state = callFlowReducer(state, { type: "REMOVE_ISSUE", index: 0 });
    expect(state.capturedIssues).toEqual([]);
  });

  it("GO_TO_SECTION moves to a specific section", () => {
    let state = getInitialCallFlowState();
    state = callFlowReducer(state, { type: "GO_TO_SECTION", sectionIndex: 3 });
    expect(state.phase).toBe("in_script");
    expect(state.currentSectionIndex).toBe(3);
  });
});

describe("callFlow helpers", () => {
  it("canAdvanceSection respects the section count", () => {
    let state = callFlowReducer(getInitialCallFlowState(), { type: "START_DIAL" });
    state = callFlowReducer(state, { type: "DIAL_OUTCOME", disposition: "connected" });
    expect(canAdvanceSection(state, 3)).toBe(true);
    state = callFlowReducer(state, { type: "GO_TO_SECTION", sectionIndex: 2 });
    expect(canAdvanceSection(state, 3)).toBe(false);
  });

  it("canGoBack returns false at the start", () => {
    let state = callFlowReducer(getInitialCallFlowState(), { type: "START_DIAL" });
    state = callFlowReducer(state, { type: "DIAL_OUTCOME", disposition: "connected" });
    expect(canGoBack(state)).toBe(false);
    state = callFlowReducer(state, { type: "ADVANCE_SECTION" });
    expect(canGoBack(state)).toBe(true);
  });

  it("isCallActive recognises the live phases", () => {
    expect(isCallActive(getInitialCallFlowState())).toBe(false);
    let state = callFlowReducer(getInitialCallFlowState(), { type: "START_DIAL" });
    expect(isCallActive(state)).toBe(true);
    state = callFlowReducer(state, { type: "DIAL_OUTCOME", disposition: "connected" });
    expect(isCallActive(state)).toBe(true);
    state = callFlowReducer(state, { type: "COMPLETE_CALL", disposition: "completed_neutral" });
    expect(isCallActive(state)).toBe(false);
  });
});
