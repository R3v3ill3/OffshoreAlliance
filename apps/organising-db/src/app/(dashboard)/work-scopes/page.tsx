"use client";

import { WorkScopesTab } from "@/components/overview/work-scopes-tab";

export default function WorkScopesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Work Scopes</h1>
        <p className="text-muted-foreground">
          Browse the work scope hierarchy and see which employers and worksites
          are associated with each scope.
        </p>
      </div>
      <WorkScopesTab />
    </div>
  );
}
