"use client";

import { useParams } from "next/navigation";
import { MobileDialer } from "@/components/phone/mobile";

/**
 * Shareable mobile dialer entry point.
 *
 * Hands the token-from-URL straight to the mobile dialer orchestrator,
 * which owns bootstrap, claim, attempt, and release transports as well as
 * the screen-state machine. The old desktop-style `CallSessionView` shim is
 * gone — this surface is purpose-built for one-handed phone use.
 */
export default function CallSharePage() {
  const params = useParams();
  const token = (params?.token as string) ?? "";
  if (!token) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Missing call link token.
      </div>
    );
  }
  return <MobileDialer token={token} />;
}
