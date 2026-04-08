"use client";

import { ProgramsTab } from "@/components/overview/programs-tab";

export default function ProgramsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Programs</h1>
      <ProgramsTab />
    </div>
  );
}
