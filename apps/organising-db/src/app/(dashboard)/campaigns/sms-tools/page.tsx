"use client";

import { Suspense } from "react";
import { SmsToolsPage } from "@/components/sms/SmsToolsPage";

export default function SmsToolsRoutePage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading SMS tools…</div>}>
      <SmsToolsPage />
    </Suspense>
  );
}
