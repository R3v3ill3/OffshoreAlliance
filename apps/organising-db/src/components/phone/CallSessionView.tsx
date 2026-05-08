"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, FileText, Loader2, LogOut, PhoneForwarded } from "lucide-react";
import { ContactCard } from "@/components/phone/ContactCard";
import { DialOutcomeBar } from "@/components/phone/DialOutcomeBar";
import { ScriptSidePanel } from "@/components/phone/ScriptSidePanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CALL_DISPOSITIONS, SUPPORT_LEVELS } from "@/lib/phone/disposition-types";
import { mergePhoneScriptVariableContext } from "@/lib/comms/template-variables";
import type {
  CallDisposition,
  CallListItemWithWorker,
  CallListWithStats,
  CallOutcomeDefinition,
  CallScriptSection,
  DialDisposition,
  RecordCallAttemptRequest,
  SupportLevel,
} from "@/types/planner-types";
import type { CtaAmbitionWithAssessment } from "@/components/phone/CtaRatingsPanel";

export type LinkedScript = {
  script_id: number;
  is_current?: boolean;
  wave_label?: string | null;
  linked_at?: string;
  call_scripts?: {
    script_id: number;
    title: string;
    status: string;
    call_objective?: string | null;
    call_script_sections?: CallScriptSection[];
  } | null;
};

export interface CallSessionDataSource {
  fetchNext(): Promise<CallListItemWithWorker | null>;
  recordAttempt(req: RecordCallAttemptRequest): Promise<{ attempt_id: number }>;
  releaseClaim(itemId: number): Promise<void>;
  bootstrap: {
    campaignId: number;
    list: CallListWithStats;
    linkedScripts: LinkedScript[];
    outcomeDefinitions: CallOutcomeDefinition[];
    ctaAmbitions: CtaAmbitionWithAssessment[];
    scriptContext: Record<string, string | undefined>;
  };
  caller: { label: string | null; worker_id: number | null };
  canEditWorker: boolean;
  canCreateTaskList: boolean;
  onLogout?: () => void;
}

export function CallSessionView({ dataSource }: { dataSource: CallSessionDataSource }) {
  const [contact, setContact] = useState<CallListItemWithWorker | null>(null);
  const [loadingContact, setLoadingContact] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialDisposition, setDialDisposition] = useState<DialDisposition | null>(null);
  const [callDisposition, setCallDisposition] = useState<CallDisposition | null>(null);
  const [supportLevel, setSupportLevel] = useState<SupportLevel | null>(null);
  const [notes, setNotes] = useState("");
  const callStartTime = useRef<Date | null>(null);

  const list = dataSource.bootstrap.list;
  const currentLink = dataSource.bootstrap.linkedScripts.find((link) => link.is_current)
    ?? dataSource.bootstrap.linkedScripts[0]
    ?? null;
  const activeScript = currentLink?.call_scripts ?? (list as { call_scripts?: LinkedScript["call_scripts"] }).call_scripts ?? null;
  const sections = [...(activeScript?.call_script_sections ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const isConnected = dialDisposition === "connected";

  const loadNext = useCallback(async () => {
    setLoadingContact(true);
    setError(null);
    try {
      const next = await dataSource.fetchNext();
      setContact(next);
      setDialDisposition(null);
      setCallDisposition(null);
      setSupportLevel(null);
      setNotes("");
      callStartTime.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load next contact");
    } finally {
      setLoadingContact(false);
    }
  }, [dataSource]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  useEffect(() => {
    if (!contact) return;
    const itemId = contact.item_id;
    const release = () => {
      void dataSource.releaseClaim(itemId).catch(() => undefined);
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [contact, dataSource]);

  function handleDial(disposition: DialDisposition) {
    setDialDisposition(disposition);
    setCallDisposition(null);
    callStartTime.current = new Date();
  }

  async function saveAndNext(overrides?: Partial<RecordCallAttemptRequest>) {
    if (!contact) return;
    setSubmitting(true);
    setError(null);
    const duration = callStartTime.current
      ? Math.round((Date.now() - callStartTime.current.getTime()) / 1000)
      : null;
    try {
      await dataSource.recordAttempt({
        list_item_id: contact.item_id,
        script_id: activeScript?.script_id ?? list.script_id ?? null,
        dial_disposition: dialDisposition ?? "no_answer",
        call_disposition: callDisposition,
        support_level_assessed: supportLevel,
        overall_notes: notes.trim() || null,
        duration_seconds: duration,
        step_outcomes: isConnected
          ? sections.map((section, index) => ({
              section_id: section.section_id,
              reached: true,
              notes: null,
              sort_order: index,
            }))
          : [],
        ...overrides,
      });
      await loadNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record attempt");
    } finally {
      setSubmitting(false);
    }
  }

  const scriptContext = contact?.worker
    ? mergePhoneScriptVariableContext(dataSource.bootstrap.scriptContext, {
        first_name: contact.worker.first_name ?? undefined,
        last_name: contact.worker.last_name ?? undefined,
        occupation: contact.worker.occupation ?? undefined,
        employer_name: contact.worker.employer_name ?? undefined,
        worksite_name: contact.worker.worksite_name ?? undefined,
        phone: contact.worker.phone ?? undefined,
        email: contact.worker.email ?? undefined,
      })
    : dataSource.bootstrap.scriptContext;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <header className="flex items-center gap-3 border-b pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{list.name}</h1>
          <p className="text-xs text-muted-foreground">
            {dataSource.caller.label ? `Signed in as ${dataSource.caller.label}` : "Mobile calling"}
          </p>
        </div>
        <Badge variant="secondary">{dialDisposition ?? "ready"}</Badge>
        {dataSource.onLogout ? (
          <Button variant="ghost" size="sm" onClick={dataSource.onLogout}>
            <LogOut className="mr-1 h-4 w-4" />
            End
          </Button>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loadingContact ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !contact ? (
        <div className="py-16 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-500" />
          <p className="text-lg font-semibold">All done</p>
          <p className="text-sm text-muted-foreground">No more contacts are available right now.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <ContactCard contact={contact} onEdit={undefined} />

            {!dialDisposition ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Dial outcome</CardTitle>
                </CardHeader>
                <CardContent>
                  <DialOutcomeBar onSelect={handleDial} />
                </CardContent>
              </Card>
            ) : null}

            {isConnected ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Conversation outcome</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {CALL_DISPOSITIONS.map((disposition) => (
                      <Button
                        key={disposition.value}
                        type="button"
                        variant={callDisposition === disposition.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCallDisposition(disposition.value)}
                      >
                        {disposition.label}
                      </Button>
                    ))}
                  </div>
                  <Select value={supportLevel ?? ""} onValueChange={(value) => setSupportLevel(value as SupportLevel)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Assess support level" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            ) : null}

            {dialDisposition ? (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Call notes..."
                    rows={4}
                  />
                  <Button
                    className="w-full"
                    disabled={submitting || (isConnected && !callDisposition)}
                    onClick={() => void saveAndNext()}
                  >
                    {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PhoneForwarded className="mr-1 h-4 w-4" />}
                    Save & Phone Next
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="min-h-80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                Script
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sections.length > 0 ? (
                <ScriptSidePanel
                  sections={sections}
                  currentIndex={0}
                  onGoToSection={() => undefined}
                  reachedSections={new Set(sections.map((_, index) => index))}
                  workerContext={scriptContext}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No structured script attached.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
