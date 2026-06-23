"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { MobileDialer } from "@/components/phone/mobile";
import { DesktopDialer } from "@/components/phone/desktop";
import { useDialerSurface } from "@/lib/phone/session/use-dialer-surface";

/**
 * Shareable call-link entry point.
 *
 * One link, two surfaces. `useDialerSurface` resolves whether to render the
 * phone-optimised dialer (tap-to-dial, one-handed) or the desktop dialer
 * (wide layout, record-the-outcome) from an explicit `?mode=` override, a
 * stored manual preference, or device auto-detect. Both hand the token to an
 * orchestrator that owns bootstrap, claim, attempt and release.
 */
export default function CallSharePage() {
  const params = useParams();
  const token = (params?.token as string) ?? "";
  const { surface, setSurface } = useDialerSurface();

  if (!token) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Missing call link token.
      </div>
    );
  }

  if (surface === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none" />
      </div>
    );
  }

  if (surface === "desktop") {
    return <DesktopDialer token={token} onSwitchToMobile={() => setSurface("mobile")} />;
  }

  return <MobileDialer token={token} />;
}
