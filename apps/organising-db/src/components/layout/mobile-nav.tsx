"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut, RefreshCcw, Loader2 } from "lucide-react";
import { navItems, adminItems, allNavHrefs } from "./sidebar";
import { isNavItemActive } from "@/lib/nav/active-nav";

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
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href, allNavHrefs);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "hover:bg-secondary/50 hover:text-secondary-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {isAdmin && (
              <>
                <Separator className="my-2" />
                {adminItems.map((item) => {
                  const isActive = isNavItemActive(pathname, item.href, allNavHrefs);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-secondary text-secondary-foreground"
                          : "hover:bg-secondary/50 hover:text-secondary-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}
          </nav>
        </div>

        <div className="border-t p-4 bg-background">
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
            <span>Hard Refresh Connection</span>
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
            <span>{signOutInProgress ? "Signing out..." : "Sign out"}</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
