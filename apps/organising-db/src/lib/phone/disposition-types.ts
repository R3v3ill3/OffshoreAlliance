import type {
  DialDisposition,
  CallDisposition,
  CtaResponse,
  SupportLevel,
  ScriptSectionType,
  CallListPriorityStrategy,
} from '@/types/planner-types'

export const DIAL_DISPOSITIONS: { value: DialDisposition; label: string; icon: string; color: string; terminates: boolean }[] = [
  { value: 'connected', label: 'Connected', icon: 'PhoneCall', color: 'bg-green-100 text-green-700', terminates: false },
  { value: 'no_answer', label: 'No Answer', icon: 'PhoneOff', color: 'bg-slate-100 text-slate-600', terminates: true },
  { value: 'voicemail_left', label: 'Voicemail Left', icon: 'Voicemail', color: 'bg-blue-100 text-blue-700', terminates: true },
  { value: 'voicemail_no_message', label: 'VM (No Message)', icon: 'Voicemail', color: 'bg-slate-100 text-slate-600', terminates: true },
  { value: 'busy', label: 'Busy', icon: 'PhoneMissed', color: 'bg-amber-100 text-amber-700', terminates: true },
  { value: 'disconnected', label: 'Disconnected', icon: 'PhoneOff', color: 'bg-red-100 text-red-700', terminates: true },
  { value: 'wrong_number', label: 'Wrong Number', icon: 'AlertCircle', color: 'bg-red-100 text-red-700', terminates: true },
  { value: 'do_not_call', label: 'Do Not Call', icon: 'Ban', color: 'bg-red-100 text-red-800', terminates: true },
  { value: 'callback_requested', label: 'Callback', icon: 'Clock', color: 'bg-purple-100 text-purple-700', terminates: true },
]

export const CALL_DISPOSITIONS: { value: CallDisposition; label: string; color: string }[] = [
  { value: 'completed_positive', label: 'Positive Outcome', color: 'bg-green-100 text-green-700' },
  { value: 'completed_neutral', label: 'Neutral Outcome', color: 'bg-slate-100 text-slate-600' },
  { value: 'completed_negative', label: 'Negative Outcome', color: 'bg-red-100 text-red-700' },
  { value: 'partial_hung_up', label: 'Hung Up', color: 'bg-amber-100 text-amber-700' },
  { value: 'partial_asked_callback', label: 'Asked for Callback', color: 'bg-purple-100 text-purple-700' },
  { value: 'referred_to_other', label: 'Referred to Other', color: 'bg-blue-100 text-blue-700' },
]

export const CTA_RESPONSES: { value: CtaResponse; label: string; color: string }[] = [
  { value: 'accepted', label: 'Accepted', color: 'bg-green-100 text-green-700' },
  { value: 'considering', label: 'Considering', color: 'bg-amber-100 text-amber-700' },
  { value: 'declined', label: 'Declined', color: 'bg-red-100 text-red-700' },
  { value: 'not_reached', label: 'Not Reached', color: 'bg-slate-100 text-slate-500' },
]

export const SUPPORT_LEVELS: { value: SupportLevel; label: string; color: string }[] = [
  { value: 'strong_supporter', label: 'Strong Supporter', color: 'bg-green-100 text-green-800' },
  { value: 'supporter', label: 'Supporter', color: 'bg-green-50 text-green-700' },
  { value: 'neutral', label: 'Neutral', color: 'bg-slate-100 text-slate-600' },
  { value: 'unsupportive', label: 'Unsupportive', color: 'bg-red-50 text-red-600' },
  { value: 'hostile', label: 'Hostile', color: 'bg-red-100 text-red-800' },
]

export const SECTION_TYPES: { value: ScriptSectionType; label: string; description: string }[] = [
  { value: 'opening', label: 'Opening', description: 'Initial greeting and purpose of the call' },
  { value: 'introduction', label: 'Introduction & Rapport', description: 'Build rapport and set the context' },
  { value: 'discovery', label: 'Issues / Discovery', description: 'Discover what they care about at work' },
  { value: 'education', label: 'Educate (AHA)', description: 'Agitate, Hope, Action — move to understanding' },
  { value: 'ask', label: 'The Ask', description: 'Specific call to action with EAR objection handling' },
  { value: 'objection_handling', label: 'Objection Handling', description: 'Explore, Acknowledge, Redirect framework' },
  { value: 'close', label: 'Close & Inoculation', description: 'Wrap up positively, prepare for manager reaction' },
  { value: 'custom', label: 'Custom Section', description: 'Campaign-specific section' },
]

export const PRIORITY_STRATEGIES: { value: CallListPriorityStrategy; label: string; description: string }[] = [
  { value: 'sequential', label: 'Sequential', description: 'Call in the order the list was built' },
  { value: 'priority_score', label: 'Priority Score', description: 'Call highest-priority contacts first' },
  { value: 'least_recently_contacted', label: 'Least Recent', description: 'Call those not contacted recently first' },
  { value: 'random', label: 'Random', description: 'Randomise the call order' },
]
