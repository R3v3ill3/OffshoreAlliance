'use client'

/**
 * SmsResumeBanner — deliberately minimal slot (Phase 8 in-phase
 * decision). There is no SMS in-flight state worth resuming this
 * phase: unlike phone_call_actions (ResumeBanner) or a draft email
 * (EmailResumeBanner), SMS has no session/action row until Phase 10's
 * sms_chat_sessions. A `draft` sms_lists row is already listed in the
 * Blasts tab and is not "in-progress work the organiser lost".
 *
 * This component reserves the layout position and import site in the
 * header banner stack (alongside ResumeBanner and EmailResumeBanner)
 * without shipping a banner that fires on state that isn't
 * resumable. Data source once implemented: Phase 10's
 * sms_chat_sessions.
 */

interface Props {
  campaignId: number | string
}

export function SmsResumeBanner(_props: Props) {
  void _props
  return null
}
