"use client";

import { TemplatesTab } from "@/components/campaigns/templates-tab";

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Communication Templates</h1>
      <TemplatesTab />
    </div>
  );
}
