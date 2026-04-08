"use client";

import { AgreementsTab } from "@/components/overview/agreements-tab";

export default function AgreementsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Agreements</h1>
      <AgreementsTab />
    </div>
  );
}
