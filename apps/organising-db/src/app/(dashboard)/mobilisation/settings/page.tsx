"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilisationTabs } from "../_components/tabs";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

interface PrefsShape {
  email_immediate: boolean;
  push_immediate: boolean;
  digest: string;
  min_priority: string;
}

interface SettingsShape {
  slack_webhook_url: string | null;
  teams_webhook_url: string | null;
  ais_satellite_enabled: boolean;
  escalation_window_days: number;
  updated_at?: string;
}

const DEFAULT_PREFS: PrefsShape = {
  email_immediate: true,
  push_immediate: false,
  digest: "daily",
  min_priority: "high",
};

export default function MobilisationSettingsPage() {
  const { user, isAdmin } = useAuth();
  const prefs = useQuery({
    queryKey: ["mobilisation-prefs", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("mobilisation_prefs").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PrefsShape | null) ?? DEFAULT_PREFS;
    },
  });
  const settings = useQuery({
    queryKey: ["mobilisation-settings"],
    enabled: isAdmin,
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("mobilisation_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw new Error(error.message);
      return data as SettingsShape | null;
    },
  });
  const rules = useQuery({
    queryKey: ["mobilisation-rules"],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("mobilisation_rules").select("*").order("rule_id");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <SettingsBody
      userId={user?.id ?? null}
      isAdmin={isAdmin}
      prefs={prefs.data}
      prefsKey={prefs.dataUpdatedAt}
      settings={settings.data ?? null}
      settingsKey={settings.dataUpdatedAt}
      rules={rules.data ?? []}
    />
  );
}

function SettingsBody({
  userId,
  isAdmin,
  prefs,
  prefsKey,
  settings,
  settingsKey,
  rules,
}: {
  userId: string | null;
  isAdmin: boolean;
  prefs: PrefsShape | undefined;
  prefsKey: number;
  settings: SettingsShape | null;
  settingsKey: number;
  rules: { rule_id: number; name: string; description: string | null; enabled: boolean }[];
}) {
  const queryClient = useQueryClient();
  const toggleRule = useMutation({
    mutationFn: async (row: { rule_id: number; enabled: boolean }) => {
      const sb = createClient();
      const { error } = await sb.from("mobilisation_rules").update({ enabled: !row.enabled }).eq("rule_id", row.rule_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobilisation-rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Immediate email and push for alerts at or above your threshold. A daily or weekly digest covers the rest. The in-app feed is always on.
        </p>
      </div>
      <MobilisationTabs current="/mobilisation/settings" />

      {userId && prefs && (
        <PrefsForm key={prefsKey} userId={userId} initial={prefs} />
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Alert rules</h2>
        <ul className="divide-y rounded-lg border">
          {rules.map((rule) => (
            <li key={rule.rule_id} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div>
                <div className="font-medium">{rule.name}</div>
                <p className="text-muted-foreground">{rule.description}</p>
              </div>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => toggleRule.mutate(rule)}>
                  {rule.enabled ? "Enabled" : "Off"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && settings && (
        <TeamForm key={settingsKey} initial={settings} />
      )}
    </div>
  );
}

function PrefsForm({ userId, initial }: { userId: string; initial: PrefsShape }) {
  const queryClient = useQueryClient();
  const [emailImmediate, setEmailImmediate] = useState(initial.email_immediate);
  const [pushImmediate, setPushImmediate] = useState(initial.push_immediate);
  const [digest, setDigest] = useState(initial.digest);
  const [minPriority, setMinPriority] = useState(initial.min_priority);

  const savePrefs = useMutation({
    mutationFn: async () => {
      const sb = createClient();
      const { error } = await sb.from("mobilisation_prefs").upsert({
        user_id: userId,
        email_immediate: emailImmediate,
        push_immediate: pushImmediate,
        digest,
        min_priority: minPriority,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Notification preferences saved");
      queryClient.invalidateQueries({ queryKey: ["mobilisation-prefs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function enablePush() {
    const registration = await navigator.serviceWorker.register("/mobilisation-sw.js");
    const keyResponse = await fetch("/api/mobilisation/vapid");
    const { publicKey } = await keyResponse.json();
    if (!publicKey) {
      toast.error("Push needs VAPID_PUBLIC_KEY on the server.");
      return;
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
    const json = subscription.toJSON();
    const sb = createClient();
    const { error } = await sb.from("mobilisation_push_subscriptions").upsert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    }, { onConflict: "endpoint" });
    if (error) {
      toast.error(error.message);
      return;
    }
    setPushImmediate(true);
    toast.success("This browser will receive mobilisation pushes.");
  }

  return (
    <form
      className="max-w-lg space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        savePrefs.mutate();
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={emailImmediate} onChange={(e) => setEmailImmediate(e.target.checked)} />
        Email me immediately
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pushImmediate} onChange={(e) => setPushImmediate(e.target.checked)} />
        Mobile / browser push
      </label>
      <Button type="button" variant="outline" onClick={() => enablePush().catch((e: Error) => toast.error(e.message))}>
        Enable push on this browser
      </Button>
      <label className="block text-sm">
        Digest
        <select className="mt-1 block rounded-md border bg-background px-2 py-1" value={digest} onChange={(e) => setDigest(e.target.value)}>
          <option value="off">Off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      <label className="block text-sm">
        Immediate threshold
        <select className="mt-1 block rounded-md border bg-background px-2 py-1" value={minPriority} onChange={(e) => setMinPriority(e.target.value)}>
          <option value="low">Low and above</option>
          <option value="normal">Normal and above</option>
          <option value="high">High and critical</option>
          <option value="critical">Critical only</option>
        </select>
      </label>
      <Button type="submit">Save my notifications</Button>
    </form>
  );
}

function TeamForm({ initial }: { initial: SettingsShape }) {
  const [slack, setSlack] = useState(initial.slack_webhook_url ?? "");
  const [teams, setTeams] = useState(initial.teams_webhook_url ?? "");
  const [satellite, setSatellite] = useState(initial.ais_satellite_enabled);
  const [windowDays, setWindowDays] = useState(initial.escalation_window_days);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const sb = createClient();
      const { error } = await sb.from("mobilisation_settings").update({
        slack_webhook_url: slack.trim() || null,
        teams_webhook_url: teams.trim() || null,
        ais_satellite_enabled: satellite,
        escalation_window_days: windowDays,
      }).eq("id", 1);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success("Team settings saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="max-w-lg space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        saveSettings.mutate();
      }}
    >
      <h2 className="font-medium">Team channels and AIS tier</h2>
      <label className="block text-sm">
        Slack webhook
        <Input className="mt-1" value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="https://hooks.slack.com/..." />
      </label>
      <label className="block text-sm">
        Teams webhook
        <Input className="mt-1" value={teams} onChange={(e) => setTeams(e.target.value)} placeholder="https://..." />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={satellite} onChange={(e) => setSatellite(e.target.checked)} />
        Satellite AIS tier — poll vessels that are still far from the coast. Terrestrial AIS only sees them a few days out.
      </label>
      <label className="block text-sm">
        Cross-layer window (days)
        <Input className="mt-1 max-w-[120px]" type="number" min={7} max={180} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} />
      </label>
      <p className="text-xs text-muted-foreground">
        The AIS vendor key stays in DATALASTIC_API_KEY. This flag only changes how far out we keep polling. Positions are not published outside the app.
      </p>
      <Button type="submit">Save team settings</Button>
    </form>
  );
}
