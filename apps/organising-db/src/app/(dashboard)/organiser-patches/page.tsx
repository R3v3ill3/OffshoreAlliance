"use client";

import { OrganiserPatchesTab } from "@/components/administration/organiser-patches-tab";

export default function OrganiserPatchesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Organiser Patches</h1>
      <OrganiserPatchesTab />
    </div>
  );
}
