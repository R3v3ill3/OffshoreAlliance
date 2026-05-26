import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MobileInstallPrompt } from "@/components/phone/mobile/MobileInstallPrompt";
import { MobileOfflineBanner } from "@/components/phone/mobile/MobileOfflineBanner";
import { MobileServiceWorkerBootstrap } from "@/components/phone/mobile/MobileServiceWorkerBootstrap";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OA Dialer",
  description: "Mobile-first phone call dialer for Offshore Alliance organising campaigns.",
  manifest: "/call-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OA Dialer",
  },
  icons: {
    icon: [{ url: "/call-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/call-icon.svg" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b2a5b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Layout for the shareable mobile dialer.
 *
 * - Marks the page as a PWA-installable surface via the linked webmanifest.
 * - Registers the dialer service worker (offline shell + claim-aware
 *   attempt queueing) on mount.
 * - Renders the install-to-home-screen prompt when the browser fires
 *   `beforeinstallprompt`.
 */
export default function CallShareLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MobileServiceWorkerBootstrap />
      <MobileOfflineBanner />
      {children}
      <MobileInstallPrompt />
    </>
  );
}
