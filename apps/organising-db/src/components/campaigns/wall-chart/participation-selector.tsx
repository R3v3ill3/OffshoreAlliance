"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ParticipationSource =
  | { kind: "any" }
  | { kind: "latest" }
  | { kind: "activity"; activityId: number; label: string }
  | { kind: "task_list"; taskListId: number; activityId: number | null; label: string };

export type ParticipationSelectorProps = {
  campaignId: string;
  value: ParticipationSource;
  onChange: (next: ParticipationSource) => void;
};

const ANY_VALUE = "any";
const LATEST_VALUE = "latest";

export function ParticipationSelector({ campaignId, value, onChange }: ParticipationSelectorProps) {
  const supabase = createClient();

  const { data: activities = [] } = useQuery({
    queryKey: ["wallchart-activities-list", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select("activity_id, title, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { activity_id: number; title: string; created_at: string }[];
    },
  });

  const { data: taskLists = [] } = useQuery({
    queryKey: ["wallchart-task-lists-list", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_task_lists")
        .select("task_list_id, title, activity_id, status")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        task_list_id: number;
        title: string;
        activity_id: number | null;
        status: string | null;
      }[];
    },
  });

  const selectValue = serializeSource(value);

  const handleChange = (next: string) => {
    if (next === ANY_VALUE) return onChange({ kind: "any" });
    if (next === LATEST_VALUE) return onChange({ kind: "latest" });
    if (next.startsWith("a:")) {
      const id = Number(next.slice(2));
      const a = activities.find((x) => x.activity_id === id);
      return onChange({ kind: "activity", activityId: id, label: a?.title ?? `Activity ${id}` });
    }
    if (next.startsWith("t:")) {
      const id = Number(next.slice(2));
      const t = taskLists.find((x) => x.task_list_id === id);
      return onChange({
        kind: "task_list",
        taskListId: id,
        activityId: t?.activity_id ?? null,
        label: t?.title ?? `Task list ${id}`,
      });
    }
  };

  return (
    <Select value={selectValue} onValueChange={handleChange}>
      <SelectTrigger className="h-7 text-xs min-w-[12rem]">
        <SelectValue placeholder="Participation source" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>General</SelectLabel>
          <SelectItem value={ANY_VALUE}>Any supportive rating</SelectItem>
          <SelectItem value={LATEST_VALUE}>Latest activity</SelectItem>
        </SelectGroup>
        {activities.length > 0 && (
          <SelectGroup>
            <SelectLabel>Activities</SelectLabel>
            {activities.map((a) => (
              <SelectItem key={a.activity_id} value={`a:${a.activity_id}`}>
                {a.title}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {taskLists.length > 0 && (
          <SelectGroup>
            <SelectLabel>Task lists</SelectLabel>
            {taskLists.map((t) => (
              <SelectItem key={t.task_list_id} value={`t:${t.task_list_id}`}>
                {t.title}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

function serializeSource(src: ParticipationSource): string {
  switch (src.kind) {
    case "any":
      return ANY_VALUE;
    case "latest":
      return LATEST_VALUE;
    case "activity":
      return `a:${src.activityId}`;
    case "task_list":
      return `t:${src.taskListId}`;
  }
}

export function participationSourceLabel(src: ParticipationSource): string {
  switch (src.kind) {
    case "any":
      return "Participation (supportive)";
    case "latest":
      return "Latest activity";
    case "activity":
      return src.label || "Activity";
    case "task_list":
      return src.label || "Task list";
  }
}
