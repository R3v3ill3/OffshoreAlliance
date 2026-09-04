'use client'

/**
 * Create wizard for the SMS hub — one page, two decisions, then the
 * real editor.
 *
 *   1. What: blast / chat board / survey / relay.
 *   2. Where: standalone (or org-wide for a relay) vs linked to a
 *      campaign, with a searchable campaign picker.
 *
 * "Continue" opens the same create sheet the campaign tabs use, right
 * here, with the chosen campaign behind it. Standalone actions get a
 * hidden episode campaign created first and discarded again if the
 * sheet is closed without saving — the organiser never sees it.
 *
 * `?duplicate=<ref>` seeds the sheet from an existing action (message,
 * sender and settings — never the audience, targets excepted) and
 * defaults the scope to the source's.
 *
 * `?kind=blast&launch_relay=<id>` is the LAUNCH TEXT path: a blast that
 * invites members to text a relay. It locks the kind, takes its scope
 * from the relay (its campaign, or an episode for an org-wide one) and
 * opens the blast sheet seeded with the relay's number rendered into
 * the body. The relay wizard reaches the same sheet directly, having
 * already asked who the text comes from.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Copy, Loader2, Megaphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSmsHubCampaigns, SMS_ACTIVITY_QUERY_KEY, SMS_NUMBERS_QUERY_KEY } from '@/lib/hooks/useSmsHub'
import { useSmsListDetail } from '@/lib/hooks/useSmsBroadcast'
import { useSmsSurveyDetail } from '@/lib/hooks/useSmsSurveys'
import { useSmsRelayDetail } from '@/lib/hooks/useSmsRelays'
import {
  useCreateSmsEpisode,
  useDeleteSmsEpisode,
  useRenameSmsEpisode,
} from '@/lib/hooks/useSmsEpisodes'
import {
  decodeSmsActionRef,
  duplicateName,
  isSmsActionKind,
  parseScopeParam,
  scopeOptionsForKind,
  smsActionHref,
  SMS_ACTION_KIND_LABEL,
  type SmsActionKind,
  type SmsActionRef,
} from '@/lib/sms/hub-actions'
import {
  NewBlastSheet,
  type NewBlastInitial,
  type NewBlastRelaySeed,
} from '@/components/sms/InlineSmsOpsPanel'
import { NewChatBoardSheet, type NewChatBoardInitial } from '@/components/sms/p2p/SmsP2pPanel'
import { SurveyEditorSheet } from '@/components/sms/surveys/SmsSurveysPanel'
import {
  NewRelaySheet,
  type NewRelayInitial,
  type RelayLaunchIntent,
} from '@/components/sms/relays/SmsRelaysPanel'
import {
  DEFAULT_RELAY_LAUNCH_TEMPLATE,
  isPermittedRelaySender,
  relayLaunchBlastName,
  renderRelayLaunchBody,
} from '@/lib/sms/relay-launch'
import { useSmsSenders } from '@/lib/hooks/useSmsBroadcast'
import { SmsActionKindPicker, SMS_ACTION_KIND_META } from './SmsActionKindPicker'
import { SmsScopePicker, type SmsScopeMode } from './SmsScopePicker'

interface ActiveSheet {
  /** Campaign the sheet writes into; null only for an org-wide relay. */
  campaignId: number | null
  /** True when campaignId is a hidden episode we created for this run. */
  episode: boolean
}

/** A launch text in flight: the relay it advertises, plus how to ask. */
interface LaunchBlast {
  intent: RelayLaunchIntent
  /** The relay's current moderation setting, for the nudge. */
  moderationRequired: boolean
  /** True on the URL path, where nobody has asked about the sender yet. */
  chooseSender: boolean
}

export function SmsCreateActionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { canWrite } = useAuth()

  const duplicate = useMemo(
    () => decodeSmsActionRef(searchParams.get('duplicate')),
    [searchParams],
  )
  const kindParam = searchParams.get('kind')
  const initialScope = useMemo(() => parseScopeParam(searchParams.get('scope')), [searchParams])

  const [kind, setKind] = useState<SmsActionKind | null>(() =>
    duplicate ? duplicate.kind : isSmsActionKind(kindParam) ? kindParam : null,
  )
  const [mode, setMode] = useState<SmsScopeMode>(() => {
    if (initialScope?.type === 'campaign') return 'campaign'
    if (initialScope?.type === 'org') return 'org'
    if (initialScope?.type === 'standalone') return 'standalone'
    return kind === 'relay' ? 'org' : 'standalone'
  })
  const [campaignId, setCampaignId] = useState<number | null>(() =>
    initialScope?.type === 'campaign' ? initialScope.campaignId : null,
  )
  const [active, setActive] = useState<ActiveSheet | null>(null)
  const [starting, setStarting] = useState(false)

  // ── Launch text ───────────────────────────────────────────────
  // Set either by the relay sheet handing back an intent, or by the
  // ?launch_relay= entry point once the relay loads. While it is set
  // the page is building a launch text, whatever `kind` says.
  const [launch, setLaunch] = useState<LaunchBlast | null>(null)
  const launchRelayId = useMemo(() => {
    const raw = searchParams.get('launch_relay')
    if (!raw || !/^\d+$/.test(raw)) return null
    const n = Number(raw)
    return n > 0 ? n : null
  }, [searchParams])
  const launchRelay = useSmsRelayDetail(launchRelayId)
  const launchAutoStarted = useRef(false)
  /**
   * `launch_sender`: 'relay' or an organiser number id, carried over
   * when the relay sheet already asked. The choice is still shown in
   * the blast sheet — pre-set rather than re-asked.
   */
  const launchSenderParam = searchParams.get('launch_sender')

  const { data: campaigns = [], isLoading: campaignsLoading } = useSmsHubCampaigns()
  const createEpisode = useCreateSmsEpisode()
  const deleteEpisode = useDeleteSmsEpisode()
  const renameEpisode = useRenameSmsEpisode()

  // Relays cannot be standalone and the rest cannot be org-wide; when
  // the kind changes, snap the scope to a valid option.
  useEffect(() => {
    if (!kind) return
    const allowed = scopeOptionsForKind(kind)
    if (!allowed.includes(mode)) setMode(allowed[0])
  }, [kind, mode])

  // ── Duplicate source ──────────────────────────────────────────
  const source = useDuplicateSource(duplicate)

  // Default the scope to the source's, once known, unless the URL set one.
  useEffect(() => {
    if (!duplicate || initialScope || !source.scope) return
    setMode(source.scope.mode)
    setCampaignId(source.scope.campaignId)
  }, [duplicate, initialScope, source.scope])

  const scopeReady = mode !== 'campaign' || campaignId != null
  const selectedCampaign = campaigns.find((c) => c.campaign_id === campaignId) ?? null
  const canContinue =
    !!kind &&
    scopeReady &&
    !starting &&
    (!duplicate || source.ready) &&
    // The launch path opens its own sheet once the relay is known.
    launchRelayId == null

  const start = useCallback(async () => {
    if (!kind || !scopeReady) return
    setStarting(true)
    try {
      if (mode === 'standalone') {
        const ep = await createEpisode.mutateAsync({
          kind: kind === 'relay' ? 'blast' : kind,
          name: source.name ? duplicateName(source.name) : undefined,
        })
        setActive({ campaignId: ep.campaign_id, episode: true })
      } else if (mode === 'org') {
        setActive({ campaignId: null, episode: false })
      } else {
        setActive({ campaignId, episode: false })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the SMS action')
    } finally {
      setStarting(false)
    }
  }, [kind, mode, campaignId, scopeReady, createEpisode, source.name])

  /**
   * Open the blast sheet for a launch text. Campaign-linked relays use
   * their own campaign; an org-wide relay has none, so the blast gets a
   * hidden episode exactly as a standalone blast does — deleted again
   * if the sheet closes unsaved.
   */
  const startLaunchBlast = useCallback(
    async (next: LaunchBlast) => {
      setStarting(true)
      try {
        const campaign = next.intent.relayCampaignId
        if (campaign != null) {
          setActive({ campaignId: campaign, episode: false })
          setMode('campaign')
          setCampaignId(campaign)
        } else {
          const ep = await createEpisode.mutateAsync({
            kind: 'blast',
            name: relayLaunchBlastName(next.intent.relayName),
          })
          setActive({ campaignId: ep.campaign_id, episode: true })
          setMode('standalone')
          setCampaignId(null)
        }
        setKind('blast')
        setLaunch(next)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not start the launch text',
        )
      } finally {
        setStarting(false)
      }
    },
    [createEpisode],
  )

  // ?launch_relay=<id>: the relay detail's "Send launch text" button and
  // the campaign Relays tab both land here. Nobody has been asked about
  // the sender yet, so the blast sheet does the asking.
  useEffect(() => {
    if (launchRelayId == null || launchAutoStarted.current) return
    const detail = launchRelay.data
    if (!detail?.number) return
    launchAutoStarted.current = true
    const fromRelayNumber = launchSenderParam === 'relay'
    const organiserNumberId =
      launchSenderParam && /^\d+$/.test(launchSenderParam)
        ? Number(launchSenderParam)
        : null
    void startLaunchBlast({
      intent: {
        relayId: detail.relay.relay_id,
        relayName: detail.relay.name,
        relayPhoneE164: detail.number.phone_e164,
        relayNumberId: detail.relay.number_id,
        relayCampaignId: detail.relay.campaign_id,
        senderMode: fromRelayNumber ? 'relay_number' : 'different_number',
        senderNumberId: fromRelayNumber
          ? detail.relay.number_id
          : organiserNumberId,
      },
      moderationRequired: detail.relay.moderation_required,
      chooseSender: true,
    })
  }, [launchRelayId, launchRelay.data, launchSenderParam, startLaunchBlast])

  const closeSheet = useCallback(
    (saved: boolean) => {
      if (active?.episode && !saved && active.campaignId != null) {
        deleteEpisode.mutate(active.campaignId)
      }
      setActive(null)
      setLaunch(null)
    },
    [active, deleteEpisode],
  )

  const finish = useCallback(
    (ref: SmsActionRef, name?: string) => {
      if (active?.episode && active.campaignId != null && name?.trim()) {
        renameEpisode.mutate({ campaignId: active.campaignId, name: name.trim() })
      }
      void queryClient.invalidateQueries({ queryKey: SMS_ACTIVITY_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: SMS_NUMBERS_QUERY_KEY })
      setActive(null)
      router.push(smsActionHref(ref, { standalone: !!active?.episode }))
    },
    [active, queryClient, renameEpisode, router],
  )

  /**
   * Cancelling a launch text: discard the episode, then land on the
   * relay. It exists either way — created a moment ago by the wizard,
   * or already there on the ?launch_relay= path — and leaving the
   * organiser on a half-locked create page instead would strand them.
   */
  const cancelLaunch = useCallback(() => {
    const relayId = launch?.intent.relayId ?? launchRelayId
    closeSheet(false)
    if (relayId != null) {
      router.push(smsActionHref({ kind: 'relay', id: relayId }))
    }
  }, [launch, launchRelayId, closeSheet, router])

  /** A saved launch text lands on the relay, which now lists it. */
  const finishLaunch = useCallback(
    (name?: string) => {
      if (!launch) return
      if (active?.episode && active.campaignId != null && name?.trim()) {
        renameEpisode.mutate({ campaignId: active.campaignId, name: name.trim() })
      }
      void queryClient.invalidateQueries({ queryKey: SMS_ACTIVITY_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: SMS_NUMBERS_QUERY_KEY })
      void queryClient.invalidateQueries({
        queryKey: ['sms-relay', launch.intent.relayId],
      })
      const relayId = launch.intent.relayId
      setActive(null)
      setLaunch(null)
      router.push(smsActionHref({ kind: 'relay', id: relayId }))
    },
    [active, launch, queryClient, renameEpisode, router],
  )

  if (!canWrite) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <BackRow />
        <Card>
          <CardHeader>
            <CardTitle>New SMS action</CardTitle>
            <CardDescription>
              You don&apos;t have permission to create SMS actions.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const summary = kind
    ? mode === 'standalone'
      ? `a standalone ${SMS_ACTION_KIND_LABEL[kind].toLowerCase()}`
      : mode === 'org'
        ? `an org-wide ${SMS_ACTION_KIND_LABEL[kind].toLowerCase()}`
        : selectedCampaign
          ? `a ${SMS_ACTION_KIND_LABEL[kind].toLowerCase()} linked to ${selectedCampaign.name}`
          : `a ${SMS_ACTION_KIND_LABEL[kind].toLowerCase()} linked to a campaign — pick one below`
    : null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BackRow />

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">New SMS action</h1>
        <p className="text-sm text-muted-foreground">
          Choose what to run and where it belongs. The editor opens next.
        </p>
      </div>

      {duplicate && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Copy className="h-4 w-4 shrink-0" />
          {source.loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading the {SMS_ACTION_KIND_LABEL[duplicate.kind].toLowerCase()} to copy…
            </span>
          ) : source.error ? (
            <span>
              Could not load the original to copy — starting blank instead.
            </span>
          ) : (
            <span>
              Duplicating <strong>{source.name}</strong>. Message and settings
              come across; the audience does not.
            </span>
          )}
        </div>
      )}

      {launchRelayId != null && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Megaphone className="h-4 w-4 shrink-0" />
          {launchRelay.isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading the relay…
            </span>
          ) : launchRelay.data ? (
            <span>
              Launch text for <strong>{launchRelay.data.relay.name}</strong> — a
              blast inviting members to text its number.
            </span>
          ) : (
            <span>That relay could not be loaded — start a blast instead.</span>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. What do you want to run?</CardTitle>
        </CardHeader>
        <CardContent>
          <SmsActionKindPicker
            value={kind}
            onChange={setKind}
            disabled={!!duplicate || launchRelayId != null}
          />
        </CardContent>
      </Card>

      <Card className={!kind ? 'opacity-60' : undefined}>
        <CardHeader>
          <CardTitle className="text-base">2. Where does it belong?</CardTitle>
          <CardDescription>
            {kind === 'relay'
              ? 'Relays are org-wide by default. Link one to a campaign when its targets only matter there.'
              : 'Standalone is right for a one-off. Link a campaign when you want its lists, assessments and reporting.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {kind ? (
            <SmsScopePicker
              kind={kind}
              mode={mode}
              campaignId={campaignId}
              campaigns={campaigns}
              campaignsLoading={campaignsLoading}
              onModeChange={setMode}
              onCampaignChange={setCampaignId}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a kind first.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-sm">
          {summary ? (
            <>
              You&apos;re creating <strong>{summary}</strong>.
            </>
          ) : (
            <span className="text-muted-foreground">Pick a kind to continue.</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/sms">Cancel</Link>
          </Button>
          <Button onClick={() => void start()} disabled={!canContinue}>
            {starting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-1.5 h-4 w-4" />
            )}
            Continue
          </Button>
        </div>
      </div>

      {/* The editors. Keyed on the campaign so a new run remounts with a
          clean state and the duplicate seed. */}
      {active && launch && active.campaignId != null && (
        <NewBlastSheet
          key={`launch-${launch.intent.relayId}-${active.campaignId}`}
          campaignId={String(active.campaignId)}
          standaloneMode={active.episode}
          open
          initial={{
            name: relayLaunchBlastName(launch.intent.relayName),
            composer: {
              body: renderRelayLaunchBody(
                DEFAULT_RELAY_LAUNCH_TEMPLATE,
                launch.intent.relayPhoneE164,
              ),
              sender_number_id: launch.intent.senderNumberId,
            },
            relay: {
              relay_id: launch.intent.relayId,
              phone_e164: launch.intent.relayPhoneE164,
              number_id: launch.intent.relayNumberId,
              name: launch.intent.relayName,
              moderation_required: launch.moderationRequired,
              chooseSender: launch.chooseSender,
            } satisfies NewBlastRelaySeed,
          }}
          onOpenChange={(o) => {
            if (!o) cancelLaunch()
          }}
          onCreated={(_listId, name) => finishLaunch(name)}
        />
      )}
      {active && !launch && kind === 'blast' && active.campaignId != null && (
        <NewBlastSheet
          key={`blast-${active.campaignId}`}
          campaignId={String(active.campaignId)}
          standaloneMode={active.episode}
          open
          initial={source.blast}
          onOpenChange={(o) => {
            if (!o) closeSheet(false)
          }}
          onCreated={(listId, name) =>
            finish({ kind: 'blast', campaignId: active.campaignId as number, id: listId }, name)
          }
        />
      )}
      {active && kind === 'chat' && active.campaignId != null && (
        <NewChatBoardSheet
          key={`chat-${active.campaignId}`}
          campaignId={String(active.campaignId)}
          standaloneMode={active.episode}
          open
          sourceListId={null}
          initial={source.chat}
          onOpenChange={(o) => {
            if (!o) closeSheet(false)
          }}
          onCreated={(listId, name) =>
            finish({ kind: 'chat', campaignId: active.campaignId as number, id: listId }, name)
          }
        />
      )}
      {active && kind === 'survey' && active.campaignId != null && (
        <SurveyEditorSheet
          key={`survey-${active.campaignId}`}
          campaignId={String(active.campaignId)}
          surveyId={null}
          open
          hideAssessments={active.episode}
          duplicateFrom={source.surveyKey}
          onOpenChange={(o) => {
            if (!o) closeSheet(false)
          }}
          onSaved={(surveyId, title) =>
            finish(
              { kind: 'survey', campaignId: active.campaignId as number, id: surveyId },
              title,
            )
          }
        />
      )}
      {active && !launch && kind === 'relay' && (
        <NewRelaySheet
          key={`relay-${active.campaignId ?? 'org'}`}
          campaignId={active.campaignId}
          open
          lockScope
          // A brand-new relay opens with the launch step armed — it has
          // no audience yet. A duplicate keeps the source's settings and
          // its own launch text already exists.
          initial={source.relay ?? { launch: true }}
          onOpenChange={(o) => {
            // Not while a launch text is taking over the page — closing
            // then would discard the episode it just claimed.
            if (!o && !launch) closeSheet(false)
          }}
          onCreated={(relayId, launchIntent) => {
            if (launchIntent) {
              // The sender was already settled in the relay sheet.
              void startLaunchBlast({
                intent: launchIntent,
                moderationRequired: false,
                chooseSender: false,
              })
              return
            }
            finish({ kind: 'relay', id: relayId })
          }}
        />
      )}
    </div>
  )
}

function BackRow() {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href="/sms">
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to SMS
      </Link>
    </Button>
  )
}

interface DuplicateSource {
  loading: boolean
  error: boolean
  /** Sheet may open: source loaded, or there is nothing to load. */
  ready: boolean
  name: string | null
  scope: { mode: SmsScopeMode; campaignId: number | null } | null
  blast?: NewBlastInitial
  chat?: NewChatBoardInitial
  surveyKey: string | null
  relay?: NewRelayInitial
}

/**
 * Loads whatever the duplicate ref points at and turns it into the
 * seed the matching sheet understands. Each kind's detail route is
 * readable org-wide, so a copy may cross campaigns.
 */
function useDuplicateSource(ref: SmsActionRef | null): DuplicateSource {
  const listRef = ref && (ref.kind === 'blast' || ref.kind === 'chat') ? ref : null
  const surveyRef = ref?.kind === 'survey' ? ref : null
  const relayRef = ref?.kind === 'relay' ? ref : null

  const list = useSmsListDetail(
    listRef ? String(listRef.campaignId) : '',
    listRef ? listRef.id : null,
  )
  const survey = useSmsSurveyDetail(
    surveyRef ? String(surveyRef.campaignId) : '',
    surveyRef ? surveyRef.id : null,
  )
  const relay = useSmsRelayDetail(relayRef ? relayRef.id : null)
  // Copying a launch text keeps it a launch text — otherwise the copy
  // loses the link that licensed its sender and gates its queueing.
  const sourceRelayId = list.data?.list.relay_id ?? null
  const sourceRelay = useSmsRelayDetail(sourceRelayId)
  const { data: senders } = useSmsSenders()
  const { data: campaigns = [] } = useSmsHubCampaigns(!!ref)

  return useMemo<DuplicateSource>(() => {
    if (!ref) {
      return { loading: false, error: false, ready: true, name: null, scope: null, surveyKey: null }
    }
    const scopeFor = (campaignId: number | null): DuplicateSource['scope'] => {
      if (campaignId == null) return { mode: 'org', campaignId: null }
      // A campaign that is not in the visible list is a hidden episode.
      const visible = campaigns.some((c) => c.campaign_id === campaignId)
      return visible
        ? { mode: 'campaign', campaignId }
        : { mode: 'standalone', campaignId: null }
    }

    if (listRef) {
      if (list.isLoading) {
        return { loading: true, error: false, ready: false, name: null, scope: null, surveyKey: null }
      }
      if (!list.data) {
        return { loading: false, error: true, ready: true, name: null, scope: null, surveyKey: null }
      }
      const srcRelayId = list.data.list.relay_id ?? null
      // The relay and the sender purposes both have to be in hand before
      // the seed can decide whether the source's sender may come across.
      if (srcRelayId != null && (sourceRelay.isLoading || !senders)) {
        return { loading: true, error: false, ready: false, name: null, scope: null, surveyKey: null }
      }
      const relayDetail = srcRelayId != null ? (sourceRelay.data ?? null) : null
      const srcSenderId = list.data.list.sender_number_id
      // Guard rather than assumption: a relay number that is not this
      // list's relay would be an illegal sender on the copy, so drop it
      // and let the composer default instead.
      const keepSender = isPermittedRelaySender({
        senderNumberId: srcSenderId,
        senderPurpose: (senders ?? []).find((x) => x.number_id === srcSenderId)
          ?.purpose,
        listRelayId: srcRelayId,
        relayNumberId: relayDetail?.relay.number_id ?? null,
      })
      const seed = {
        name: duplicateName(list.data.list.name),
        composer: {
          body: list.data.draft?.body ?? '',
          sender_number_id: keepSender ? srcSenderId : null,
          timezone: list.data.list.timezone || 'Australia/Perth',
          blackout_override: list.data.list.blackout_override,
          blackout_override_reason: list.data.list.blackout_override_reason ?? '',
        },
      }
      const relaySeed: NewBlastRelaySeed | null =
        listRef.kind === 'blast' && relayDetail?.number
          ? {
              relay_id: relayDetail.relay.relay_id,
              phone_e164: relayDetail.number.phone_e164,
              number_id: relayDetail.relay.number_id,
              name: relayDetail.relay.name,
              moderation_required: relayDetail.relay.moderation_required,
            }
          : null
      return {
        loading: false,
        error: false,
        ready: true,
        name: list.data.list.name,
        scope: scopeFor(list.data.list.campaign_id),
        surveyKey: null,
        ...(listRef.kind === 'blast'
          ? { blast: { ...seed, ...(relaySeed ? { relay: relaySeed } : {}) } }
          : { chat: seed }),
      }
    }

    if (surveyRef) {
      if (survey.isLoading) {
        return { loading: true, error: false, ready: false, name: null, scope: null, surveyKey: null }
      }
      if (!survey.data) {
        return { loading: false, error: true, ready: true, name: null, scope: null, surveyKey: null }
      }
      return {
        loading: false,
        error: false,
        ready: true,
        name: survey.data.survey.title,
        scope: scopeFor(survey.data.survey.campaign_id),
        surveyKey: `${surveyRef.campaignId}:${surveyRef.id}`,
      }
    }

    // relayRef
    if (relay.isLoading) {
      return { loading: true, error: false, ready: false, name: null, scope: null, surveyKey: null }
    }
    if (!relay.data) {
      return { loading: false, error: true, ready: true, name: null, scope: null, surveyKey: null }
    }
    const r = relay.data.relay
    return {
      loading: false,
      error: false,
      ready: true,
      name: r.name,
      scope: scopeFor(r.campaign_id),
      surveyKey: null,
      relay: {
        name: duplicateName(r.name),
        targets: relay.data.targets.map((t) => ({
          phone: t.phone_e164,
          display_name: t.display_name ?? '',
        })),
        prefix: r.prefix_template,
        suffix: r.suffix_template,
        moderation_required: r.moderation_required,
        quiet_hours_respected: r.quiet_hours_respected,
        bridge_replies: r.bridge_replies,
        confirmation_template: r.confirmation_template,
        timezone: r.timezone,
      },
    }
  }, [ref, listRef, surveyRef, list.isLoading, list.data, survey.isLoading, survey.data, relay.isLoading, relay.data, sourceRelay.isLoading, sourceRelay.data, senders, campaigns])
}

