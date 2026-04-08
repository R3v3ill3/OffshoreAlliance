"use client";

import { EmployersTab } from "@/components/overview/employers-tab";

export default function EmployersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employers</h1>
        <p className="text-muted-foreground">
          Manage employers, contractors, and labour hire companies.
        </p>
      </div>
      <EmployersTab />
    </div>
  );
}
