"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  resolveCampaignOrganiserId,
} from "@/lib/campaign/resolve-campaign-organiser";
import { CampaignOrganiserSelect } from "@/components/campaigns/campaign-organiser-select";
import type {
  CampaignStatus,
  CampaignType,
} from "@/types/database";
import Link from "next/link";

/**
 * Manual create entry point. Captures only the absolute minimum needed to
 * create a campaigns row (name + type + status + organiser), then redirects
 * straight to /campaigns/[id]/settings where the full accordion editor
 * exposes every section. Power users who want to fill everything in one
 * screen rather than walking the wizard land here.
 */
function ManualCreateForm() {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user, canWrite, isAdmin, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [campaignType, setCampaignType] =
    useState<CampaignType>("bargaining");
  const [status, setStatus] = useState<CampaignStatus>("planning");
  const [organiserId, setOrganiserId] = useState("");

  const permissionWarned = useRef(false);
  useEffect(() => {
    if (authLoading || !user || canWrite) return;
    if (permissionWarned.current) return;
    permissionWarned.current = true;
    console.warn("[ManualCreateForm] canWrite is false");
  }, [user, canWrite, authLoading]);

  const createMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const resolvedOrganiserId = await resolveCampaignOrganiserId(
        supabase,
        organiserId,
        { currentUserId: user.id, isAdmin }
      );
      const payload: Record<string, unknown> = {
        name,
        campaign_type: campaignType,
        status,
      };
      if (resolvedOrganiserId != null) payload.organiser_id = resolvedOrganiserId;
      const { data, error } = await supabase
        .from("campaigns")
        .insert(payload)
        .select("campaign_id")
        .single();
      if (error) throw error;
      return data.campaign_id as number;
    },
    onSuccess: (cid) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.replace(`/campaigns/${cid}/settings`);
    },
  });

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (!canWrite) {
    return (
      <p className="text-muted-foreground">
        You do not have permission to create campaigns.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create campaign — manual mode</h1>
          <p className="text-sm text-muted-foreground">
            Set the bare minimum to create the campaign, then edit every section
            on one page from settings. Prefer the guided wizard?{" "}
            <Link
              href="/campaigns/new"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Switch to the wizard
            </Link>
            .
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bootstrap</CardTitle>
          <CardDescription>
            Just the essentials. Everything else (employers, worksites,
            agreements, units, workers, ambitions) gets configured in the
            settings page that opens after you create the campaign.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme EBA 2026"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Campaign type</Label>
              <Select
                value={campaignType}
                onValueChange={(v) => setCampaignType(v as CampaignType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bargaining">Bargaining</SelectItem>
                  <SelectItem value="organising">Organising</SelectItem>
                  <SelectItem value="mobilisation">Mobilisation</SelectItem>
                  <SelectItem value="political">Political</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as CampaignStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <CampaignOrganiserSelect
            label="Organiser"
            value={organiserId}
            onChange={(v) => setOrganiserId(v === "__none__" ? "" : v)}
            allowNone
            autoDefaultToCurrentUser
          />
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name || createMutation.isPending}
            className="self-start"
          >
            {createMutation.isPending ? "Creating…" : "Create and open settings"}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ManualCreatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <EurekaLoadingSpinner />
        </div>
      }
    >
      <ManualCreateForm />
    </Suspense>
  );
}
