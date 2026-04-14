import type { DialDisposition, CallDisposition } from '@/types/planner-types'

export type CallFlowPhase =
  | 'idle'
  | 'loading_contact'
  | 'pre_call'
  | 'dialing'
  | 'not_reached'
  | 'connected'
  | 'in_script'
  | 'early_exit'
  | 'call_complete'
  | 'recording_disposition'
  | 'session_ended'

export type CallFlowAction =
  | { type: 'LOAD_CONTACT' }
  | { type: 'CONTACT_LOADED' }
  | { type: 'START_DIAL' }
  | { type: 'DIAL_OUTCOME'; disposition: DialDisposition }
  | { type: 'ADVANCE_SECTION' }
  | { type: 'GO_TO_SECTION'; sectionIndex: number }
  | { type: 'EARLY_EXIT' }
  | { type: 'COMPLETE_CALL'; disposition: CallDisposition }
  | { type: 'DISPOSITION_RECORDED' }
  | { type: 'SKIP_CONTACT' }
  | { type: 'END_SESSION' }
  | { type: 'RESET' }

export interface CallFlowState {
  phase: CallFlowPhase
  currentSectionIndex: number
  dialDisposition: DialDisposition | null
  callDisposition: CallDisposition | null
  callStartedAt: Date | null
}

const INITIAL_STATE: CallFlowState = {
  phase: 'idle',
  currentSectionIndex: 0,
  dialDisposition: null,
  callDisposition: null,
  callStartedAt: null,
}

export function callFlowReducer(state: CallFlowState, action: CallFlowAction): CallFlowState {
  switch (action.type) {
    case 'LOAD_CONTACT':
      return { ...INITIAL_STATE, phase: 'loading_contact' }

    case 'CONTACT_LOADED':
      return { ...state, phase: 'pre_call' }

    case 'START_DIAL':
      return { ...state, phase: 'dialing', callStartedAt: new Date() }

    case 'DIAL_OUTCOME': {
      if (action.disposition === 'connected') {
        return { ...state, phase: 'connected', dialDisposition: 'connected', currentSectionIndex: 0 }
      }
      return { ...state, phase: 'not_reached', dialDisposition: action.disposition }
    }

    case 'ADVANCE_SECTION':
      return { ...state, phase: 'in_script', currentSectionIndex: state.currentSectionIndex + 1 }

    case 'GO_TO_SECTION':
      return { ...state, phase: 'in_script', currentSectionIndex: action.sectionIndex }

    case 'EARLY_EXIT':
      return { ...state, phase: 'early_exit' }

    case 'COMPLETE_CALL':
      return { ...state, phase: 'call_complete', callDisposition: action.disposition }

    case 'DISPOSITION_RECORDED':
      return { ...state, phase: 'recording_disposition' }

    case 'SKIP_CONTACT':
      return { ...state, phase: 'recording_disposition' }

    case 'END_SESSION':
      return { ...state, phase: 'session_ended' }

    case 'RESET':
      return INITIAL_STATE

    default:
      return state
  }
}

export function getInitialCallFlowState(): CallFlowState {
  return { ...INITIAL_STATE }
}

export function canAdvanceSection(state: CallFlowState, totalSections: number): boolean {
  return (
    (state.phase === 'connected' || state.phase === 'in_script') &&
    state.currentSectionIndex < totalSections - 1
  )
}

export function canGoBack(state: CallFlowState): boolean {
  return (
    (state.phase === 'connected' || state.phase === 'in_script') &&
    state.currentSectionIndex > 0
  )
}

export function isCallActive(state: CallFlowState): boolean {
  return ['dialing', 'connected', 'in_script'].includes(state.phase)
}
