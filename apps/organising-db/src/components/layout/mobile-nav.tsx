"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Building2, ChevronDown, Eye, Menu, LogOut, RefreshCcw, Loader2 } from "lucide-react";
import { NavRow } from "./nav-row";
import { ALL_NAV_HREFS, buildNavModel, isNavRowActive } from "@/lib/nav/nav-model";
import { useWorkspace } from "@/lib/workspace/use-workspace";
import { useEmailInboxUnreadCount } from "@/lib/hooks/useEmailInbox";

const ROW_BASE =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const ROW_ACTIVE = "bg-secondary text-secondary-foreground";
const ROW_INACTIVE = "hover:bg-secondary/50 hover:text-secondary-foreground";
const BADGE_CLASS =
  "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [signOutInProgress, setSignOutInProgress] = useState(false);
  const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null);
  const pathname = usePathname();
  const {
    user,
    profile,
    signOut,
    hardRefreshConnection,
    connectionRecoveryInProgress,
    isAdmin,
  } = useAuth();
  const { data: emailUnreadCount = 0 } = useEmailInboxUnreadCount(!!user);
  const workspace = useWorkspace();
  const { mode, moduleState, canShowEverything, showEverything } = workspace;

  const model = useMemo(
    () =>
      buildNavModel({
        mode,
        moduleState,
        isAdmin,
        canShowEverything,
        showEverything,
        unreadEmail: emailUnreadCount,
      }),
    [mode, moduleState, isAdmin, canShowEverything, showEverything, emailUnreadCount]
  );

  // Closed on every first paint, then re-synced on a mode change. A
  // `useState` initialiser is read once, while the workspace is still
  // resolving to full mode, so it latched the section OPEN and never
  // revisited it — see the long note in `sidebar.tsx`, which this mirrors.
  const [orgOpen, setOrgOpen] = useState(false);
  const organisationCollapsed = model.organisation.collapsed;
  useEffect(() => {
    setOrgOpen(!organisationCollapsed);
  }, [organisationCollapsed]);

  const organisationItems = model.organisation.items.filter((i) => i.state !== "hidden");

  const handleHardRefresh = async () => {
    setRecoveryFeedback("Checking database connection...");
    const result = await hardRefreshConnection();
    if (result.ok) {
      setRecoveryFeedback("Connection restored. Reloading now...");
    } else if (!result.redirectedToLogin) {
      setRecoveryFeedback(`Connection refresh failed: ${result.message}`);
    }
  };

  const handleSignOut = async () => {
    if (signOutInProgress) return;
    setSignOutInProgress(true);
    try {
      await signOut();
    } finally {
      setSignOutInProgress(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden mr-2">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] p-0 flex flex-col">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded">
              <video
                src="/heritage_Eureka.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-cover"
                aria-hidden
              />
            </div>
            <span>Offshore Alliance</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <nav className="grid gap-1 px-2">
            {model.primary.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                isActive={isNavRowActive(pathname, item, ALL_NAV_HREFS)}
                baseClassName={ROW_BASE}
                activeClassName={ROW_ACTIVE}
                inactiveClassName={ROW_INACTIVE}
                showLabel
                badgeClassName={BADGE_CLASS}
                onNavigate={() => setOpen(false)}
              />
            ))}

            {organisationItems.length > 0 && (
              <>
                <Separator className="my-2" />
                {/* The disclosure must NOT close the sheet — it reveals rows inside it. */}
                <button
                  type="button"
                  aria-expanded={orgOpen}
                  aria-controls="mobile-nav-organisation"
                  onClick={() => setOrgOpen((v) => !v)}
                  className={cn("w-full", ROW_BASE, ROW_INACTIVE)}
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span>Organisation</span>
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 transition-transform",
                      orgOpen && "rotate-180"
                    )}
                  />
                </button>
                {orgOpen && (
                  <div id="mobile-nav-organisation" className="grid gap-1 pl-3">
                    {organisationItems.map((item) => (
                      <NavRow
                        key={item.id}
                        item={item}
                        isActive={isNavRowActive(pathname, item, ALL_NAV_HREFS)}
                        baseClassName={ROW_BASE}
                        activeClassName={ROW_ACTIVE}
                        inactiveClassName={ROW_INACTIVE}
                        showLabel
                        badgeClassName={BADGE_CLASS}
                        onNavigate={() => setOpen(false)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {model.admin.length > 0 && (
              <>
                <Separator className="my-2" />
                {model.admin.map((item) => (
                  <NavRow
                    key={item.id}
                    item={item}
                    isActive={isNavRowActive(pathname, item, ALL_NAV_HREFS)}
                    baseClassName={ROW_BASE}
                    activeClassName={ROW_ACTIVE}
                    inactiveClassName={ROW_INACTIVE}
                    showLabel
                    badgeClassName={BADGE_CLASS}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </>
            )}
          </nav>
        </div>

        <div className="border-t p-4 bg-background">
          {model.showEverythingControl !== "hidden" && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 mb-2"
              aria-pressed={model.showEverythingControl === "active"}
              onClick={() => {
                setOpen(false);
                workspace.setShowEverything(!showEverything);
              }}
            >
              <Eye className="h-4 w-4 shrink-0" />
              <span>Show everything</span>
            </Button>
          )}
          {user && (
            <div className="mb-2 px-2 text-sm font-medium truncate">
              {profile?.display_name || user.email}
            </div>
          )}
          <Button
            variant="outline"
            className="w-full justify-start gap-2 mb-2"
            disabled={connectionRecoveryInProgress}
            onClick={() => void handleHardRefresh()}
          >
            {connectionRecoveryInProgress ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4 shrink-0" />
            )}
            <span>{model.footer.hardRefresh.label}</span>
          </Button>
          {recoveryFeedback && (
            <p className="mb-2 px-2 text-xs text-muted-foreground">{recoveryFeedback}</p>
          )}
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            disabled={signOutInProgress}
            onClick={() => {
              setOpen(false);
              void handleSignOut();
            }}
          >
            {signOutInProgress ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4 shrink-0" />
            )}
            <span>{signOutInProgress ? "Signing out..." : model.footer.signOut.label}</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
