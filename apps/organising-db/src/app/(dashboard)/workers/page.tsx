"use client";

import { WorkersTab } from "@/components/overview/workers-tab";

export default function WorkersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Workers</h1>
      <WorkersTab />
    </div>
  );
}
