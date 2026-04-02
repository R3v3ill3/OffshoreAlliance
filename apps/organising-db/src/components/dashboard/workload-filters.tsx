"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WorkloadFiltersProps {
  filterOrganiser: string;
  filterStatus: string;
  filterTimePeriod: string;
  onFilterOrganiserChange: (value: string) => void;
  onFilterStatusChange: (value: string) => void;
  onFilterTimePeriodChange: (value: string) => void;
}

export function WorkloadFilters({
  filterOrganiser,
  filterStatus,
  filterTimePeriod,
  onFilterOrganiserChange,
  onFilterStatusChange,
  onFilterTimePeriodChange,
}: WorkloadFiltersProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {/* Organiser Filter */}
          <div className="space-y-2">
            <Label htmlFor="filter-organiser">Organiser</Label>
            <Select
              value={filterOrganiser}
              onValueChange={onFilterOrganiserChange}
            >
              <SelectTrigger id="filter-organiser">
                <SelectValue placeholder="All organisers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">My Team</SelectItem>
                <SelectItem value="me">Me Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <Label htmlFor="filter-status">Status</Label>
            <Select value={filterStatus} onValueChange={onFilterStatusChange}>
              <SelectTrigger id="filter-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time Period Filter */}
          <div className="space-y-2">
            <Label htmlFor="filter-time">Time Period</Label>
            <Select
              value={filterTimePeriod}
              onValueChange={onFilterTimePeriodChange}
            >
              <SelectTrigger id="filter-time">
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
                <SelectItem value="365">Last Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
