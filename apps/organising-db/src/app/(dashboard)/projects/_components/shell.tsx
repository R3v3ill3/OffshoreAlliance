"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/supabase/auth-context";
import { useProjectsAttention } from "@/lib/hooks/useProjectsAttention";
import { useRefreshUpcomingProjects } from "@/lib/hooks/useRefreshUpcomingProjects";
import { useRematchUpcomingProjects } from "@/lib/hooks/useRematchUpcomingProjects";
import {
  PROJECTS_ALERTS_PATH,
  PROJECTS_PATH,
  PROJECTS_TABS,
} from "@/lib/projects/routes";
import { cn } from "@/lib/utils/cn";

const DETAIL = /^\/projects\/(vessels|contractors)\//;

export function ProjectsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? PROJECTS_PATH;
  const detail = DETAIL.test(pathname);
  const { isAdmin } = useAuth();
  const attention = useProjectsAttention();

  return (
    <div className="space-y-4">
      {!detail && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Projects</h1>
            <p className="text-sm text-muted-foreground">
              Approved and in-assessment offshore activities, contract and vessel signals, and alerts for the North West.
            </p>
          </div>
          {isAdmin && <AdminUpdate />}
        </div>
      )}

      {!detail && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href={PROJECTS_ALERTS_PATH}
            className="rounded-lg border p-3 hover:bg-muted/40"
          >
            <div className="text-xs text-muted-foreground">Alerts</div>
            <div className="text-lg font-semibold">{attention.openAlerts} open</div>
          </Link>
          <Link
            href={`${PROJECTS_PATH}?status=review_or_unmatched`}
            className="rounded-lg border p-3 hover:bg-muted/40"
          >
            <div className="text-xs text-muted-foreground">Employer matches</div>
            <div className="text-lg font-semibold">{attention.matchAttention} need attention</div>
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b pb-3">
        {PROJECTS_TABS.map((tab) => {
          const active = tab.href === PROJECTS_PATH
            ? pathname === PROJECTS_PATH
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}

function AdminUpdate() {
  const queryClient = useQueryClient();
  const refresh = useRefreshUpcomingProjects();
  const rematch = useRematchUpcomingProjects();
  const poll = useMutation({
    mutationFn: async (layer: "regulatory" | "commercial" | "ais") => {
      const response = await fetch("/api/mobilisation/poll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ layer }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Poll failed");
      return (body.notes as string[]) ?? [];
    },
    onSuccess: (notes) => {
      toast.success(notes.join(" · ") || "Poll finished");
      queryClient.invalidateQueries({ queryKey: ["mobilisation-signals"] });
      queryClient.invalidateQueries({ queryKey: ["mobilisation-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["mobilisation-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["project-regulatory-signals"] });
      queryClient.invalidateQueries({ queryKey: ["projects-open-alert-count"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = refresh.isPending || rematch.isPending || poll.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              "Re-evaluate every unconfirmed match using the current matcher? Confirmed, overridden, and rejected rows will not be touched."
            )
          ) {
            rematch.mutate();
          }
        }}
      >
        {rematch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Re-evaluate matches
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy}>
            {refresh.isPending || poll.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Update data
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => refresh.mutate()}>Approved activities scrape</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => poll.mutate("regulatory")}>
            Regulatory poll (NOPSEMA, notices, NOPTA)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => poll.mutate("commercial")}>News and ASX poll</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => poll.mutate("ais")}>AIS poll</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {refresh.isError && (
        <p className="text-sm text-destructive">Refresh failed: {(refresh.error as Error).message}</p>
      )}
      {rematch.isSuccess && rematch.data && (
        <p className="text-xs text-muted-foreground">
          Re-evaluated {rematch.data.total}: {rematch.data.auto} auto, {rematch.data.needs_review} review, {rematch.data.unmatched} unmatched.
        </p>
      )}
    </div>
  );
}
