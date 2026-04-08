"use client";

import { WorkloadTab } from "@/components/administration/workload-tab";

export default function WorkloadDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Workload Dashboard</h1>
      <WorkloadTab />
    </div>
  );
}
